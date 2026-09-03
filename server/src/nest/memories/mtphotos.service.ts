import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { safeFetch } from '../../utils/ssrfGuard';
import { decrypt_api_key, maybe_encrypt_api_key } from '../common/crypto/apiKeyCrypto';
import { DatabaseService } from '../database/database.service';
import { fail, handleServiceResult, pipeAsset, type AssetInfo, type ServiceResult } from './memories.helpers';

const MT_PHOTOS_TOKEN_CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes
const THUMB_MAX_WIDTH = 300;
const THUMB_QUALITY = 80;

interface MtphotosCredentials {
  url: string;
  username: string;
  password: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
  credentials: MtphotosCredentials;
}

interface MtphotosSearchResult {
  day: string;
  list: Array<{ id: number | string; fileType: string; width?: number; height?: number; MD5?: string }>;
}

interface MtphotosFileInfo {
  id: number | string;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  gps?: { latitude?: number; longitude?: number } | null;
  tags?: unknown[];
  // Date/time fields — the API may return various forms
  dateTaken?: string;
  date?: string;
  createdAt?: string;
  // EXIF-like fields
  make?: string;
  model?: string;
  lensModel?: string;
  focalLength?: string | number;
  fNumber?: string | number;
  exposureTime?: string;
  iso?: number | string;
  orientation?: number;
  description?: string;
}

/**
 * MT Photos photo provider service.
 *
 * Connects to an MT Photos server (e.g. http://10.1.1.110:8063) and
 * provides search, file info, streaming, and thumbnail generation.
 *
 * Configuration is via environment variables:
 * - MT_PHOTOS_URL: Base URL of the MT Photos server
 * - MT_PHOTOS_USERNAME: Login username
 * - MT_PHOTOS_PASSWORD: Login password
 *
 * JWT tokens are cached in-memory per credential set and re-used until
 * expiry (with a 5-minute safety margin).
 */
@Injectable()
export class MtphotosService {
  private readonly tokenCache = new Map<string, CachedToken>();
  private readonly thumbCache = new Map<string, Buffer>();

  constructor(private readonly db: DatabaseService) {}

  // ── Credential Management ─────────────────────────────────────────────

  /**
   * Read MT Photos credentials for a user from the database.
   * Credentials are stored encrypted via the standard encrypt/decrypt helpers.
   */
  getMtphotosCredentials(userId: number): MtphotosCredentials | null {
    const row = this.db.prepare(
      'SELECT mtphotos_url, mtphotos_username, mtphotos_password FROM users WHERE id = ?'
    ).get(userId) as { mtphotos_url?: string | null; mtphotos_username?: string | null; mtphotos_password?: string | null } | undefined;

    if (!row?.mtphotos_url || !row.mtphotos_username || !row.mtphotos_password) {
      return null;
    }

    const password = decrypt_api_key(row.mtphotos_password);
    if (!password) return null;

    return {
      url: row.mtphotos_url,
      username: row.mtphotos_username,
      password,
    };
  }

  /**
   * Get connection settings (non-secret) for the settings page.
   */
  getConnectionSettings(userId: number): { url: string; username: string; connected: boolean } {
    const creds = this.getMtphotosCredentials(userId);
    return {
      url: creds?.url || '',
      username: creds?.username || '',
      connected: !!creds,
    };
  }

  /**
   * Save MT Photos credentials to the database.
   */
  saveSettings(userId: number, url: string | undefined, username: string | undefined, password: string | undefined): { success: boolean; error?: string } {
    if (url) {
      if (url.endsWith('/')) url = url.slice(0, -1);
    }
    this.db.prepare(
      'UPDATE users SET mtphotos_url = ?, mtphotos_username = ?, mtphotos_password = ? WHERE id = ?'
    ).run(
      url?.trim() || null,
      username?.trim() || null,
      password ? maybe_encrypt_api_key(password) : null,
      userId
    );
    return { success: true };
  }

  /**
   * Test connection by attempting to authenticate.
   */
  async testConnection(url: string, username: string, password: string): Promise<{ connected: boolean; error?: string }> {
    if (url.endsWith('/')) url = url.slice(0, -1);
    try {
      const resp = await safeFetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, dev: true }),
        signal: AbortSignal.timeout(10000) as any,
      });
      if (!resp.ok) return { connected: false, error: `HTTP ${resp.status}` };
      const data = await resp.json() as { access_token?: string };
      if (!data?.access_token) return { connected: false, error: 'No access token received' };
      return { connected: true };
    } catch (err: unknown) {
      return { connected: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  /**
   * Get connection status for a user.
   */
  async getConnectionStatus(userId: number): Promise<{ connected: boolean; error?: string }> {
    const creds = this.getMtphotosCredentials(userId);
    if (!creds) return { connected: false, error: 'Not configured' };
    try {
      const resp = await safeFetch(`${creds.url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: creds.username, password: creds.password, dev: true }),
        signal: AbortSignal.timeout(10000) as any,
      });
      if (!resp.ok) return { connected: false, error: `HTTP ${resp.status}` };
      const data = await resp.json() as { access_token?: string };
      if (!data?.access_token) return { connected: false, error: 'No access token received' };
      return { connected: true };
    } catch (err: unknown) {
      return { connected: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  // ── Token Management ──────────────────────────────────────────────────

  /**
   * Get a valid JWT token, re-using a cached one if not expired.
   * MT Photos tokens last ~30 minutes; we refresh at 25.
   */
  private async getToken(userId: number): Promise<string> {
    const creds = this.getMtphotosCredentials(userId);
    if (!creds) throw new Error('MT Photos not configured');

    const cacheKey = `${userId}:${creds.url}:${creds.username}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() && cached.credentials.password === creds.password) {
      return cached.token;
    }

    const resp = await safeFetch(`${creds.url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creds.username, password: creds.password, dev: true }),
      signal: AbortSignal.timeout(10000) as any,
    });
    if (!resp.ok) throw new Error(`MT Photos login failed: HTTP ${resp.status}`);
    const data = await resp.json() as { access_token?: string };
    if (!data?.access_token) throw new Error('MT Photos login returned no access token');

    this.tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + MT_PHOTOS_TOKEN_CACHE_TTL_MS,
      credentials: creds,
    });
    return data.access_token;
  }

  private getBaseUrl(userId: number): string {
    const creds = this.getMtphotosCredentials(userId);
    if (!creds) throw new Error('MT Photos not configured');
    return creds.url;
  }

  // ── Search ────────────────────────────────────────────────────────────

  async searchPhotos(
    userId: number,
    from?: string,
    to?: string,
    page: number = 1,
    pageSize: number = 50,
  ): Promise<{ assets?: Array<{ id: string; takenAt: string; mediaType?: string; lat?: number | null; lng?: number | null }>; hasMore?: boolean; error?: string; status?: number }> {
    try {
      const token = await this.getToken(userId);
      const baseUrl = this.getBaseUrl(userId);

      const body: Record<string, unknown> = { pageSize, page };
      if (from) body.startDate = from;
      if (to) body.endDate = to;

      const resp = await safeFetch(`${baseUrl}/gateway/searchV2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000) as any,
      });

      if (!resp.ok) {
        return { error: 'Search failed', status: resp.status };
      }

      const data = await resp.json() as { result?: MtphotosSearchResult[] };

      // MT Photos searchV2 returns results grouped by day, not a flat list.
      const allAssets: Array<{ id: string; takenAt: string; mediaType?: string; lat?: number | null; lng?: number | null }> = [];
      const days = data.result || [];
      for (const dayGroup of days) {
        const day = dayGroup.day; // e.g. "2026-09-01"
        for (const item of dayGroup.list) {
          allAssets.push({
            id: String(item.id),
            takenAt: day, // Best approximation from search response
            mediaType: this._isVideo(item.fileType) ? 'video' : 'image',
            lat: null,
            lng: null,
          });
        }
      }

      return {
        assets: allAssets,
        hasMore: allAssets.length >= pageSize,
      };
    } catch (err: unknown) {
      return { error: 'Could not reach MT Photos', status: 502 };
    }
  }

  // ── Asset Info ────────────────────────────────────────────────────────

  async getAssetInfo(userId: number, assetId: string): Promise<ServiceResult<AssetInfo>> {
    try {
      const token = await this.getToken(userId);
      const baseUrl = this.getBaseUrl(userId);

      const resp = await safeFetch(`${baseUrl}/gateway/fileInfoById/${assetId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000) as any,
      });

      if (!resp.ok) return fail('Failed to fetch file info', resp.status);

      const info = await resp.json() as MtphotosFileInfo;

      return {
        success: true,
        data: {
          id: String(info.id),
          takenAt: info.dateTaken || info.date || info.createdAt || null,
          city: null, // MT Photos doesn't provide city directly from gps
          country: null,
          lat: info.gps?.latitude ?? null,
          lng: info.gps?.longitude ?? null,
          width: info.width ?? null,
          height: info.height ?? null,
          fileSize: info.fileSize ?? null,
          fileName: info.fileName ?? null,
          orientation: info.orientation ?? null,
          description: info.description ?? null,
          camera: info.make && info.model ? `${info.make} ${info.model}` : null,
          lens: info.lensModel ?? null,
          focalLength: info.focalLength ?? null,
          aperture: info.fNumber ?? null,
          shutter: info.exposureTime ?? null,
          iso: info.iso ?? null,
        },
      };
    } catch {
      return fail('Could not reach MT Photos', 502);
    }
  }

  // ── Thumbnail ─────────────────────────────────────────────────────────

  /**
   * Fetch thumbnail bytes for an asset.
   *
   * MT Photos has no dedicated thumbnail API, so we download the original
   * image and resize it with Jimp. Results are cached in memory to avoid
   * repeated downloads.
   */
  async fetchThumbnailBytes(userId: number, assetId: string): Promise<{ bytes: Buffer; contentType: string } | { error: string; status: number }> {
    const cacheKey = `thumb:${userId}:${assetId}`;
    const cached = this.thumbCache.get(cacheKey);
    if (cached) {
      return { bytes: cached, contentType: 'image/jpeg' };
    }

    try {
      const tmpPath = await this._downloadOriginal(userId, assetId);
      if (!tmpPath) return { error: 'Download failed', status: 502 };

      const { Jimp } = await import('jimp');
      const img = await Jimp.read(tmpPath);

      if (img.bitmap.width > THUMB_MAX_WIDTH) {
        img.scaleToFit({ w: THUMB_MAX_WIDTH, h: THUMB_MAX_WIDTH });
      }

      const buffer = await img.getBuffer('image/jpeg', { quality: THUMB_QUALITY });
      this.thumbCache.set(cacheKey, buffer);

      // Cleanup temp file
      const fs = await import('node:fs/promises');
      await fs.unlink(tmpPath).catch(() => {});

      return { bytes: buffer, contentType: 'image/jpeg' };
    } catch (err: unknown) {
      return { error: 'Thumbnail generation failed', status: 500 };
    }
  }

  // ── Stream Asset ──────────────────────────────────────────────────────

  /**
   * Proxy an MT Photos asset to the Express response.
   *
   * MT Photos fileStreamLink returns a temporary URL (30s TTL), so we must
   * fetch a fresh link for every stream request.
   */
  async streamAsset(res: Response, userId: number, assetId: string, kind: 'thumbnail' | 'original'): Promise<void> {
    try {
      const token = await this.getToken(userId);
      const baseUrl = this.getBaseUrl(userId);

      // Get a fresh stream link (30s TTL)
      const linkResp = await safeFetch(`${baseUrl}/gateway/fileStreamLink/${assetId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000) as any,
      });

      if (!linkResp.ok) {
        handleServiceResult(res, fail('Failed to get stream link', linkResp.status));
        return;
      }

      const linkData = await linkResp.json() as { link?: string; ttl?: number };
      if (!linkData?.link) {
        handleServiceResult(res, fail('No stream link returned', 500));
        return;
      }

      // Build the full stream URL
      const streamUrl = linkData.link.startsWith('http')
        ? linkData.link
        : `${baseUrl}${linkData.link}`;

      const headers: Record<string, string> = {};

      if (kind === 'thumbnail') {
        // For thumbnails, try to serve a smaller version if MT Photos supports it
        // For now, just proxy the original (same as Synology pattern for non-thumb endpoints)
        await pipeAsset(streamUrl, res, headers, AbortSignal.timeout(30000), 'public, max-age=86400');
      } else {
        await pipeAsset(streamUrl, res, headers, undefined, 'private, max-age=3600');
      }
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      handleServiceResult(res, fail('Failed to stream asset', 500));
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private _isVideo(fileType: string): boolean {
    if (!fileType) return false;
    const ft = fileType.toLowerCase();
    return ft.includes('video') || ft === 'mp4' || ft === 'mov' || ft === 'avi' || ft === 'mkv';
  }

  /**
   * Download an original file from MT Photos to a temporary path.
   * Returns the temp path, or null on failure.
   */
  private async _downloadOriginal(userId: number, assetId: string): Promise<string | null> {
    try {
      const token = await this.getToken(userId);
      const baseUrl = this.getBaseUrl(userId);

      // Get a stream link
      const linkResp = await safeFetch(`${baseUrl}/gateway/fileStreamLink/${assetId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000) as any,
      });

      if (!linkResp.ok) return null;

      const linkData = await linkResp.json() as { link?: string };
      if (!linkData?.link) return null;

      const streamUrl = linkData.link.startsWith('http')
        ? linkData.link
        : `${baseUrl}${linkData.link}`;

      // Download the file
      const resp = await safeFetch(streamUrl, {
        signal: AbortSignal.timeout(30000) as any,
      });
      if (!resp.ok) return null;

      const buffer = Buffer.from(await resp.arrayBuffer());

      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const path = await import('node:path');
      const tmpPath = path.join(os.tmpdir(), `mtphotos-thumb-${assetId}-${Date.now()}.jpg`);
      await fs.writeFile(tmpPath, buffer);
      return tmpPath;
    } catch {
      return null;
    }
  }
}
