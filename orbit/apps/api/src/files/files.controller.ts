import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { existsSync } from 'fs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from './storage/storage.interface';

@Controller('files')
export class FilesController {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Authenticated file serving. Only the submitting RO's users or an admin can
   * access a given file (spec §12.4). The submissionId is embedded in the path.
   */
  @Get(':year/:month/:submissionId/:filename')
  async serve(
    @CurrentUser() user: AuthUser,
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('submissionId') submissionId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: { roId: true },
    });
    if (!submission) throw new NotFoundException('File not found');

    const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;
    if (!isAdmin && user.roId !== submission.roId) {
      throw new ForbiddenException('You cannot access this file');
    }

    const relPath = `${year}/${month}/${submissionId}/${filename}`;
    const absPath = this.storage.resolve(relPath);
    if (!existsSync(absPath)) throw new NotFoundException('File not found');

    return res.sendFile(absPath);
  }
}
