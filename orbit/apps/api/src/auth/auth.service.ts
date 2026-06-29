import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { AuthUser } from '../common/types/auth-user';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  // --- helpers --------------------------------------------------------------

  /** SHA-256 hash for opaque tokens (refresh / setup / reset). */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateOpaqueToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async signTokens(user: {
    id: string;
    email: string;
    role: User['role'];
    roId: string | null;
  }): Promise<TokenPair> {
    const payload: AuthUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      roId: user.roId,
    };
    const jwtCfg = this.config.get('jwt');
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: jwtCfg.accessSecret,
        expiresIn: jwtCfg.accessExpiresIn,
      }),
      this.jwt.signAsync(payload, {
        secret: jwtCfg.refreshSecret,
        expiresIn: jwtCfg.refreshExpiresIn,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  /** Persist the hashed refresh token so it can be rotated/revoked. */
  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });
  }

  // --- login / logout -------------------------------------------------------

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(email: string, password: string): Promise<TokenPair & { user: SafeUser }> {
    const user = await this.validateUser(email, password);
    const tokens = await this.signTokens(user);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return { ...tokens, user: toSafeUser(user) };
  }

  /** Refresh-token rotation: validate, revoke the old, issue a new pair. */
  async refresh(oldRefreshToken: string): Promise<TokenPair> {
    if (!oldRefreshToken) throw new UnauthorizedException('Missing refresh token');

    let payload: AuthUser;
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(oldRefreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(oldRefreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, userId: payload.sub },
    });
    if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('User unavailable');

    // Rotate: revoke old, issue + store new.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });
    const tokens = await this.signTokens(user);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
  }

  // --- account activation (set-password) ------------------------------------

  /** Generate + store a hashed setup token, return the raw token for emailing. */
  async issueSetupToken(userId: string): Promise<string> {
    const raw = this.generateOpaqueToken();
    const hours = this.config.getOrThrow<number>('tokens.setupExpiresHours');
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        setupToken: this.hashToken(raw),
        setupTokenExpiresAt: new Date(Date.now() + hours * 3600_000),
      },
    });
    return raw;
  }

  async setPassword(token: string, password: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        setupToken: this.hashToken(token),
        setupTokenExpiresAt: { gt: new Date() },
      },
    });
    if (!user) throw new UnauthorizedException('Setup link is invalid or expired');

    const saltRounds = this.config.getOrThrow<number>('bcrypt.saltRounds');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, saltRounds),
        isActive: true,
        setupToken: null,
        setupTokenExpiresAt: null,
      },
    });
  }

  // --- password reset -------------------------------------------------------

  /** Always resolves (no user enumeration). Emails a reset link if user exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return;

    const raw = this.generateOpaqueToken();
    const hours = this.config.getOrThrow<number>('tokens.resetExpiresHours');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: this.hashToken(raw),
        resetTokenExpiresAt: new Date(Date.now() + hours * 3600_000),
      },
    });
    await this.mail.sendResetEmail(user.email, user.fullName, raw);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: this.hashToken(token),
        resetTokenExpiresAt: { gt: new Date() },
      },
    });
    if (!user) throw new UnauthorizedException('Reset link is invalid or expired');

    const saltRounds = this.config.getOrThrow<number>('bcrypt.saltRounds');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(password, saltRounds),
          resetToken: null,
          resetTokenExpiresAt: null,
        },
      }),
      // Invalidate all existing sessions on password reset.
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { isRevoked: true },
      }),
    ]);
  }

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { regionalOffice: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return toSafeUser(user);
  }
}

// --- safe user projection ---------------------------------------------------

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  role: User['role'];
  roId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
}

export function toSafeUser(user: any): SafeUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    roId: user.roId ?? null,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}
