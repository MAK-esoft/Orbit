import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user';
import { SubmissionsService } from './submissions.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: SubmissionsService) {}

  @Roles(Role.RO_USER)
  @Get('ro')
  roStats(@CurrentUser() user: AuthUser) {
    return this.service.roStats(user);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get('admin')
  adminStats() {
    return this.service.adminStats();
  }

  // RO: own ledger (roId ignored). Admin: ledger for the given roId.
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RO_USER)
  @Get('ledger')
  ledger(@CurrentUser() user: AuthUser, @Query('roId') roId?: string) {
    return this.service.ledger(user, roId);
  }
}
