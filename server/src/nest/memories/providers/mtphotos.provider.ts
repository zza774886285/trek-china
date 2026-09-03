import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { MtphotosService } from '../mtphotos.service';
import type { AssetInfo, ServiceResult } from '../memories.helpers';
import type {
  PhotoAssetKind, PhotoAssetRef, PhotoBytes, PhotoFetchError, PhotoProvider,
} from '../photo-provider';

/**
 * MT Photos behind the PhotoProvider interface.
 *
 * An adapter between the PhotoProvider contract and MtphotosService.
 * The service handles JWT caching, credential resolution and API calls;
 * the adapter maps them to the narrow interface that the dispatch layer
 * (PhotoResolverService, PhotoProviderRegistry) expects.
 */
@Injectable()
export class MtphotosPhotoProvider implements PhotoProvider {
  readonly id = 'mtphotos';

  constructor(private readonly mtphotos: MtphotosService) {}

  streamAsset(res: Response, ref: PhotoAssetRef, kind: PhotoAssetKind): Promise<void> {
    return this.mtphotos.streamAsset(res, ref.userId, ref.assetId, kind);
  }

  fetchThumbnailBytes(ref: PhotoAssetRef): Promise<PhotoBytes | PhotoFetchError> {
    return this.mtphotos.fetchThumbnailBytes(ref.userId, ref.assetId);
  }

  getAssetInfo(ref: PhotoAssetRef): Promise<ServiceResult<AssetInfo>> {
    return this.mtphotos.getAssetInfo(ref.userId, ref.assetId);
  }
}
