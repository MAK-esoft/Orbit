import { CookieOptions, Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './strategies/jwt.strategy';

const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15m
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7d

function baseOptions(isProd: boolean, domain?: string): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd, // Secure only over HTTPS (prod)
    sameSite: 'strict',
    path: '/',
    domain,
  };
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  isProd: boolean,
  domain?: string,
): void {
  const opts = baseOptions(isProd, domain);
  res.cookie(ACCESS_COOKIE, accessToken, { ...opts, maxAge: ACCESS_MAX_AGE });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...opts, maxAge: REFRESH_MAX_AGE });
}

export function clearAuthCookies(
  res: Response,
  isProd: boolean,
  domain?: string,
): void {
  const opts = baseOptions(isProd, domain);
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
}
