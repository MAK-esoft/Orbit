import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AuthService } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './cookies';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get isProd(): boolean {
    return this.config.get<string>('env') === 'production';
  }

  private get cookieDomain(): string | undefined {
    return this.config.get<string>('cookieDomain');
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, user } = await this.auth.login(
      dto.email,
      dto.password,
    );
    setAuthCookies(res, accessToken, refreshToken, this.isProd, this.cookieDomain);
    return user;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const tokens = await this.auth.refresh(token);
    setAuthCookies(
      res,
      tokens.accessToken,
      tokens.refreshToken,
      this.isProd,
      this.cookieDomain,
    );
    return { refreshed: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.isProd, this.cookieDomain);
    return { loggedOut: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    // Always 200 — do not reveal whether the email exists.
    return { message: 'If an account exists, a reset link has been sent.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { message: 'Password reset successfully.' };
  }

  /** Initial account activation via setup token. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  async setPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.setPassword(dto.token, dto.password);
    return { message: 'Account activated. You can now log in.' };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user.sub);
  }
}
