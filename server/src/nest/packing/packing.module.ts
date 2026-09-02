import { Module } from '@nestjs/common';
import { PackingController } from './packing.controller';
import { AdminPackingTemplatesController } from './admin-packing-templates.controller';
import { PackingMcp } from './packing.mcp';
import { PackingService } from './packing.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AddonsModule } from '../addons/addons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { McpSharedModule } from '../mcp-shared/mcp-shared.module';

/** Packing domain — registered in AppModule. Exports PackingService. */
@Module({
  imports: [McpSharedModule, NotificationsModule, PermissionsModule, AuthModule, RealtimeModule, AddonsModule, AuditModule],
  controllers: [PackingController, AdminPackingTemplatesController],
  exports: [PackingService],
})
export class PackingModule {}
