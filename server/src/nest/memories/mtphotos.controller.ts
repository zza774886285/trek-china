import { Body, Controller, Get, HttpCode, Param, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '../../types';
import type { ServiceResult } from './memories.helpers';
import { fail } from './memories.helpers';
import { MemoriesService } from './memories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MtphotosSearchDto, MtphotosSettingsDto, MtphotosTestDto } from './memories.dto';

function _parseStringBodyField(value: unknown): string {
  return String(value ?? '').trim();
}

function _parseNumberBodyField(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * /api/integrations/memories/mtphotos — MT Photos connection, search and asset proxy.
 *
 * Follows the Synology controller pattern for most routes; `/status` and
 * `/test` answer 200 even on connection failure (the service shapes
 * `{ connected: false, ... }`); `/settings` PUT validates with a 400.
 */
@Controller('api/integrations/memories/mtphotos')
@UseGuards(JwtAuthGuard)
export class MtphotosMemoriesController {
  constructor(private readonly memories: MemoriesService) {}

  private handle<T>(res: Response, result: ServiceResult<T>): void {
    if ('error' in result) {
      res.status(result.error.status).json({ error: result.error.message });
    } else {
      res.json(result.data);
    }
  }

  @Get('settings')
  async getSettings(@CurrentUser() user: User, @Res() res: Response): Promise<void> {
    res.json(this.memories.mtphotosGetSettings(user.id));
  }

  @Put('settings')
  async putSettings(@CurrentUser() user: User, @Body() body: MtphotosSettingsDto, @Res() res: Response): Promise<void> {
    const url = _parseStringBodyField(body.mtphotos_url);
    const username = _parseStringBodyField(body.mtphotos_username);
    const password = _parseStringBodyField(body.mtphotos_password);

    if (!url || !username) {
      res.status(400).json({ error: 'URL and username are required' });
      return;
    }
    const result = this.memories.mtphotosSaveSettings(user.id, url, username, password);
    if (!result.success) {
      res.status(result.error.status).json({ error: result.error.message });
      return;
    }
    res.json(result.data);
  }

  @Get('status')
  async getStatus(@CurrentUser() user: User, @Res() res: Response): Promise<void> {
    res.json(await this.memories.mtphotosGetStatus(user.id));
  }

  @Post('test')
  @HttpCode(200)
  async test(@Body() body: MtphotosTestDto, @Res() res: Response): Promise<void> {
    const url = _parseStringBodyField(body.mtphotos_url);
    const username = _parseStringBodyField(body.mtphotos_username);
    const password = _parseStringBodyField(body.mtphotos_password);

    if (!url || !username || !password) {
      const missingFields: string[] = [];
      if (!url) missingFields.push('URL');
      if (!username) missingFields.push('Username');
      if (!password) missingFields.push('Password');
      res.json({ connected: false, error: `${missingFields.join(', ')} ${missingFields.length > 1 ? 'are' : 'is'} required` });
      return;
    }
    res.json(await this.memories.mtphotosTestConnection(url, username, password));
  }

  @Post('search')
  @HttpCode(200)
  async search(@CurrentUser() user: User, @Body() body: MtphotosSearchDto, @Res() res: Response): Promise<void> {
    const from = _parseStringBodyField(body.from);
    const to = _parseStringBodyField(body.to);
    const pageNum = Math.max(1, _parseNumberBodyField(body.page, 1));
    const pageSize = Math.min(_parseNumberBodyField(body.size, 50), 200);

    const result = await this.memories.mtphotosSearchPhotos(user.id, from || undefined, to || undefined, pageNum, pageSize);
    if (result.error) {
      res.status(result.status ?? 500).json({ error: result.error });
      return;
    }
    res.json({ assets: result.assets || [], hasMore: !!result.hasMore });
  }

  @Get('assets/:tripId/:assetId/:ownerId/info')
  async assetInfo(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Param('assetId') assetId: string,
    @Param('ownerId') ownerId: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.memories.canAccessUserPhoto(user.id, Number(ownerId), tripId, assetId, 'mtphotos')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    this.handle(res, await this.memories.mtphotosGetAssetInfo(user.id, assetId));
  }

  @Get('assets/:tripId/:assetId/:ownerId/:kind')
  async asset(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Param('assetId') assetId: string,
    @Param('ownerId') ownerId: string,
    @Param('kind') kind: string,
    @Res() res: Response,
  ): Promise<void> {
    if (kind !== 'thumbnail' && kind !== 'original') {
      res.status(400).json({ error: 'Invalid asset kind' });
      return;
    }
    if (!this.memories.canAccessUserPhoto(user.id, Number(ownerId), tripId, assetId, 'mtphotos')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await this.memories.mtphotosStreamAsset(res, user.id, assetId, kind);
  }
}
