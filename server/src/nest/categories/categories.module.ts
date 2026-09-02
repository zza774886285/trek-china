import { Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { McpSharedModule } from '../mcp-shared/mcp-shared.module';
import { CategoriesController } from './categories.controller';
import { CategoriesMcp } from './categories.mcp';
import { CategoriesService } from './categories.service';

/** Categories domain (L4 leaf module). Registered in AppModule. */
@Module({
  // AuthModule is deliberately absent: CategoriesMcp's demo guard reads
  // RuntimeEnvService and the users table rather than AuthService, which keeps
  // the partial e2e TestingModule for this domain down to two tables.
  // McpSharedModule is not @Global, and AppConfigModule is imported explicitly
  // for the same reason budget/ does it.
  imports: [McpSharedModule, AppConfigModule],
  controllers: [CategoriesController],
  exports: [CategoriesService],
})
export class CategoriesModule {}
