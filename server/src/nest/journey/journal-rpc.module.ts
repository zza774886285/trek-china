import { Module } from '@nestjs/common';
import { AllowedFileTypesModule } from '../files/allowed-file-types.module';
import { MemoriesModule } from '../memories/memories.module';
import { StorageModule } from '../storage/storage.module';
import { JourneyDomainModule } from './journey-domain.module';

/**
 * Journal container — StorageService + MemoriesModule for photo bytes.
 */
@Module({
  imports: [JourneyDomainModule, StorageModule, AllowedFileTypesModule, MemoriesModule],
  exports: [JourneyDomainModule],
})
export class JournalRpcModule {}
