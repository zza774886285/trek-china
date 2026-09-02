import { Module } from '@nestjs/common';
import { ReservationsReadModule } from './reservations-read.module';
import { BudgetModule } from '../budget/budget.module';
import { DaysModule } from '../days/days.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReservationsMcp } from './reservations.mcp';
import { UpcomingReservationsController } from './upcoming-reservations.controller';
import { AuthModule } from '../auth/auth.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { McpSharedModule } from '../mcp-shared/mcp-shared.module';

/**
 * Reservations + accommodations domain (S5 — Phase 2 trip sub-domain).
 * Mounts: /api/trips/:tripId/reservations, /accommodations, and the cross-trip
 * /api/reservations/upcoming dashboard feed. ReservationsMcp carries the
 * decorator-registered MCP tools + resource for the domain.
 */
@Module({
  // DaysModule: ReservationsMcp injects DaysService for its nine getDay calls.
  // BudgetModule: ReservationsService + ReservationsMcp inject BudgetService (budget-sync seam).
  imports: [McpSharedModule, NotificationsModule, DaysModule, AssignmentsModule, PermissionsModule, BudgetModule, AuthModule, RealtimeModule, ReservationsReadModule],
  controllers: [ReservationsController, UpcomingReservationsController],
  exports: [ReservationsService],
})
export class ReservationsModule {}
