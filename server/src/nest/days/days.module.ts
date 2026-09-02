import { Module } from '@nestjs/common';
import { DaysController } from './days.controller';
import { DaysService } from './days.service';
import { DaysMcp } from './days.mcp';
import { RealtimeModule } from '../realtime/realtime.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { QueryHelpersModule } from '../query-helpers/query-helpers.module';
import { PlacesModule } from '../places/places.module';
import { AuthModule } from '../auth/auth.module';
import { McpSharedModule } from '../mcp-shared/mcp-shared.module';

/**
 * Days (S6 — Phase 2 trip sub-domain), mounted at /api/trips/:tripId/days.
 * DaysMcp carries the decorator-registered MCP tools + resources. DaysService is
 * exported for in-container consumers (, AccommodationsService,
 * TripsService, the assignments/reservations MCP controllers).
 *
 * Day notes used to live here too, with their own full file set; they are their
 * own domain now (day-notes/).
 */
@Module({
  imports: [McpSharedModule, PermissionsModule, QueryHelpersModule, PlacesModule, AuthModule, RealtimeModule],
  controllers: [DaysController],
  providers: [DaysService, DaysMcp],
  exports: [DaysService],
})
export class DaysModule {}
