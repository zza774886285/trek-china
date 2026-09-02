import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsMcp } from './tags.mcp';
import { TagsService } from './tags.service';
import { AuthModule } from '../auth/auth.module';

/** Tags domain (L5 leaf module). Registered in AppModule. */
@Module({
  imports: [AuthModule],
  controllers: [TagsController],
  // PROVIDERS only, and a missing entry here would leave tags.* answering
  // PERMISSION_DENIED with no other symptom.
  exports: [TagsService],
})
export class TagsModule {}
