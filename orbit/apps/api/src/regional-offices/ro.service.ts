import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRegionalOfficeDto } from './dto/create-ro.dto';
import { UpdateRegionalOfficeDto } from './dto/update-ro.dto';

@Injectable()
export class RegionalOfficesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const offices = await this.prisma.regionalOffice.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
    return offices.map((o) => ({
      id: o.id,
      name: o.name,
      code: o.code,
      city: o.city,
      region: o.region,
      whatsappPhone: o.whatsappPhone,
      isActive: o.isActive,
      userCount: o._count.users,
      createdAt: o.createdAt,
    }));
  }

  async findOne(id: string) {
    const office = await this.prisma.regionalOffice.findUnique({ where: { id } });
    if (!office) throw new NotFoundException('Regional office not found');
    return office;
  }

  async create(dto: CreateRegionalOfficeDto) {
    try {
      return await this.prisma.regionalOffice.create({
        data: this.normalize(dto),
      });
    } catch (e) {
      throw this.mapUniqueConflict(e, dto);
    }
  }

  async update(id: string, dto: UpdateRegionalOfficeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.regionalOffice.update({
        where: { id },
        data: this.normalize(dto),
      });
    } catch (e) {
      throw this.mapUniqueConflict(e, dto);
    }
  }

  /**
   * Coerce a blank WhatsApp number to null so the unique index treats "cleared"
   * as absent (multiple offices may have no number; Postgres allows many NULLs).
   */
  private normalize<T extends { whatsappPhone?: string }>(dto: T) {
    if (dto.whatsappPhone !== undefined) {
      return { ...dto, whatsappPhone: dto.whatsappPhone.trim() || null };
    }
    return dto;
  }

  /** Turn a Prisma unique-constraint error into a specific ConflictException. */
  private mapUniqueConflict(
    e: unknown,
    dto: CreateRegionalOfficeDto | UpdateRegionalOfficeDto,
  ) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      const target = String(
        (e.meta as { target?: string | string[] })?.target ?? '',
      );
      if (target.includes('whatsapp_phone')) {
        return new ConflictException(
          `WhatsApp number "${dto.whatsappPhone}" is already assigned to another office`,
        );
      }
      return new ConflictException(`RO code "${dto.code}" already exists`);
    }
    return e;
  }

  async findUsers(id: string) {
    await this.findOne(id);
    return this.prisma.user.findMany({
      where: { roId: id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
