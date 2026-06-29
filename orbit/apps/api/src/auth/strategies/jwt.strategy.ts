import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/types/auth-user';

export const ACCESS_COOKIE = 'orbit_access';
export const REFRESH_COOKIE = 'orbit_refresh';

/** Pulls the access token out of the HTTP-only cookie. */
const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.[ACCESS_COOKIE] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  /** The returned object becomes `req.user`. */
  async validate(payload: AuthUser): Promise<AuthUser> {
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      roId: payload.roId ?? null,
    };
  }
}
