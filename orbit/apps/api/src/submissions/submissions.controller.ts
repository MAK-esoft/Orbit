import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user';
import { attachmentMulterOptions } from '../files/multer.config';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { QuerySubmissionsDto } from './dto/query-submissions.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SubmissionsService } from './submissions.service';

@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly service: SubmissionsService) {}

  @Roles(Role.RO_USER)
  @Post()
  @UseInterceptors(FileInterceptor('file', attachmentMulterOptions))
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubmissionDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.create(user, dto, file);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RO_USER)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QuerySubmissionsDto) {
    return this.service.list(user, query);
  }

  // Defined before :id so "export" is not parsed as an id.
  // RO users export their own list; admins export across offices (service scopes it).
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RO_USER)
  @Get('export')
  async export(
    @CurrentUser() user: AuthUser,
    @Query() query: QuerySubmissionsDto,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportCsv(user, query);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="orbit-submissions.csv"',
    });
    res.send(csv);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RO_USER)
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(user, id);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.RO_USER)
  @Get(':id/history')
  history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.history(user, id);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.service.updateStatus(user, id, dto);
  }

  // Admin edit of financial fields — confirm/correct extracted values before approval.
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Patch(':id')
  updateDetails(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.service.updateDetails(user, id, dto);
  }

  @Roles(Role.RO_USER)
  @Post(':id/resubmit')
  @UseInterceptors(FileInterceptor('file', attachmentMulterOptions))
  resubmit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSubmissionDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.resubmit(user, id, dto, file);
  }
}
