import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';

function serialize(a: any) {
  return {
    id: a.id,
    roId: a.roId,
    ro: a.regionalOffice
      ? { id: a.regionalOffice.id, name: a.regionalOffice.name, code: a.regionalOffice.code }
      : undefined,
    type: a.type,
    amount: a.amount.toFixed(2),
    description: a.description,
    effectiveDate: a.effectiveDate.toISOString().slice(0, 10),
    createdBy: a.createdBy ? { id: a.createdBy.id, fullName: a.createdBy.fullName } : undefined,
    createdAt: a.createdAt,
  };
}

const INCLUDE = {
  regionalOffice: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class AdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private isAdmin(user: AuthUser) {
    return user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;
  }

  async create(user: AuthUser, dto: CreateAdjustmentDto) {
    const ro = await this.prisma.regionalOffice.findUnique({ where: { id: dto.roId } });
    if (!ro) throw new BadRequestException('Regional office not found');

    const created = await this.prisma.ledgerAdjustment.create({
      data: {
        roId: dto.roId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        description: dto.description,
        effectiveDate: new Date(dto.effectiveDate),
        createdById: user.sub,
      },
      include: INCLUDE,
    });
    return serialize(created);
  }

  async list(user: AuthUser, roId?: string) {
    const where: Prisma.LedgerAdjustmentWhereInput = {};
    if (this.isAdmin(user)) {
      if (roId) where.roId = roId;
    } else {
      // RO users only ever see their own office's entries.
      where.roId = user.roId ?? '__none__';
    }
    const rows = await this.prisma.ledgerAdjustment.findMany({
      where,
      include: INCLUDE,
      orderBy: { effectiveDate: 'desc' },
    });
    return rows.map(serialize);
  }

  async remove(user: AuthUser, id: string) {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Only admins can remove ledger entries');
    }
    const existing = await this.prisma.ledgerAdjustment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ledger entry not found');
    await this.prisma.ledgerAdjustment.delete({ where: { id } });
    return { success: true };
  }
}
