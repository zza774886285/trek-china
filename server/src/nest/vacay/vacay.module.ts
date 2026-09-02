import { Module } from '@nestjs/common';
import { VacayController } from './vacay.controller';
import { VacayService } from './vacay.service';
import { VacayMcp } from './vacay.mcp';
import { AuthModule } from '../auth/auth.module';
import { AddonsModule } from '../addons/addons.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Vacay addon domain (S1 — Phase 2 trip sub-domain). Registered in AppModule.
 * VacayService is exported for the plugin host surface ();
 * VacayMcp carries the DI-discovered MCP tools/resources.
 */
@Module({
  imports: [NotificationsModule, AuthModule, AddonsModule],
  controllers: [VacayController],
  providers: [VacayService, VacayMcp],
  exports: [VacayService],
})
export class VacayModule {}
