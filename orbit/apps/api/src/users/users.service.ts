import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthService, SafeUser, toSafeUser } from '../auth/auth.service';
import { AuthUser } from '../common/types/auth-user';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
  ) {}

  async findAll(actor: AuthUser) {
    // SUPER_ADMIN sees everyone; ADMIN sees admins + RO users (not other concerns).
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { regionalOffice: { select: { name: true, code: true } } },
    });
    return users.map((u) => ({
      ...toSafeUser(u),
      regionalOffice: u.regionalOffice ?? null,
    }));
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return toSafeUser(user);
  }

  /**
   * Create a user and email them an account-setup link.
   * - SUPER_ADMIN may create any role.
   * - ADMIN may only create RO_USER accounts.
   */
  async create(actor: AuthUser, dto: CreateUserDto): Promise<SafeUser> {
    if (dto.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can create super admins');
    }
    if (dto.role === Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can create admin users');
    }
    if (dto.role === Role.RO_USER) {
      if (!dto.roId) {
        throw new BadRequestException('roId is required for RO users');
      }
      const ro = await this.prisma.regionalOffice.findUnique({
        where: { id: dto.roId },
      });
      if (!ro) throw new BadRequestException('Regional office not found');
      if (!ro.isActive) {
        throw new BadRequestException('Cannot add users to an inactive RO');
      }
    } else if (dto.roId) {
      throw new BadRequestException('Admin users cannot be assigned to an RO');
    }

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          role: dto.role,
          roId: dto.role === Role.RO_USER ? dto.roId : null,
          isActive: false, // activated when password is set
          createdById: actor.sub,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A user with this email already exists');
      }
      throw e;
    }

    const setupToken = await this.auth.issueSetupToken(user.id);
    await this.mail.sendSetupEmail(user.email, user.fullName, setupToken);
    return toSafeUser(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    await this.findOne(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return toSafeUser(user);
  }

  /** Deactivate (soft) — also revokes all sessions. */
  async deactivate(actor: AuthUser, id: string): Promise<SafeUser> {
    if (id === actor.sub) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    await this.findOne(id);
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { isActive: false } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id },
        data: { isRevoked: true },
      }),
    ]);
    return toSafeUser(user);
  }

  /** Admin-triggered password reset — emails a reset link. */
  async triggerReset(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.auth.forgotPassword(user.email);
  }
}
