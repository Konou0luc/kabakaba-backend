import * as crypto from 'crypto';
import type { Request, Response } from 'express';

export type MobileApp = 'student' | 'vendor';

export const MOBILE_APP_HEADER = 'x-kabakaba-app';

const NAMES: Record<MobileApp, { access: string; refresh: string; csrf: string }> = {
  student: {
    access: 'kabakaba_student_access',
    refresh: 'kabakaba_student_refresh',
    csrf: 'kabakaba_student_csrf',
  },
  vendor: {
    access: 'kabakaba_vendor_access',
    refresh: 'kabakaba_vendor_refresh',
    csrf: 'kabakaba_vendor_csrf',
  },
};

const ACCESS_FALLBACK_SECONDS = 15 * 60;
const REFRESH_FALLBACK_SECONDS = 7 * 24 * 60 * 60;

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf('=');
    if (index < 0) return acc;
    const key = part.slice(0, index).trim();
    try {
      acc[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      acc[key] = part.slice(index + 1).trim();
    }
    return acc;
  }, {});
}

function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function sameSite(): 'lax' | 'strict' | 'none' {
  const envValue = (process.env.WEB_AUTH_COOKIE_SAMESITE || '').toLowerCase();
  if (envValue === 'strict' || envValue === 'none' || envValue === 'lax') return envValue;
  return isProduction() ? 'none' : 'lax';
}

function ttlSeconds(envKey: string, fallback: number): number {
  const raw = process.env[envKey]?.trim();
  const match = raw ? /^(\d+)([smhd])$/.exec(raw) : null;
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return amount * multiplier;
}

function cookiePair(name: string, value: string, maxAge: number, httpOnly: boolean): string {
  const secure = isProduction() || process.env.WEB_AUTH_COOKIE_SECURE === 'true';
  const same = sameSite();
  if (same === 'none' && !secure) {
    throw new Error('WEB_AUTH_COOKIE_SAMESITE=none exige WEB_AUTH_COOKIE_SECURE=true');
  }
  const securePart = secure ? '; Secure' : '';
  const httpOnlyPart = httpOnly ? '; HttpOnly' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}${httpOnlyPart}${securePart}; SameSite=${same}`;
}

export function mobileAppFromRequest(req: Request): MobileApp | null {
  const raw = req.headers[MOBILE_APP_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'student' || value === 'vendor' ? value : null;
}

export function getMobileAccessCookie(req: Request, app: MobileApp): string | null {
  return parseCookies(req.headers.cookie)[NAMES[app].access] ?? null;
}

export function getMobileRefreshCookie(req: Request, app: MobileApp): string | null {
  return parseCookies(req.headers.cookie)[NAMES[app].refresh] ?? null;
}

export function getMobileCsrfCookie(req: Request, app: MobileApp): string | null {
  return parseCookies(req.headers.cookie)[NAMES[app].csrf] ?? null;
}

export function issueMobileSessionCookies(
  res: Response,
  app: MobileApp,
  accessToken: string,
  refreshToken: string,
) {
  const accessMaxAge = ttlSeconds('JWT_ACCESS_EXPIRES', ACCESS_FALLBACK_SECONDS);
  const refreshMaxAge = ttlSeconds('JWT_REFRESH_EXPIRES', REFRESH_FALLBACK_SECONDS);
  const csrf = crypto.randomBytes(32).toString('base64url');
  const names = NAMES[app];
  res.setHeader('Set-Cookie', [
    cookiePair(names.access, accessToken, accessMaxAge, true),
    cookiePair(names.refresh, refreshToken, refreshMaxAge, true),
    cookiePair(names.csrf, csrf, refreshMaxAge, false),
  ]);
  return csrf;
}

export function clearMobileSessionCookies(res: Response, app: MobileApp) {
  const names = NAMES[app];
  res.setHeader('Set-Cookie', [
    cookiePair(names.access, '', 0, true),
    cookiePair(names.refresh, '', 0, true),
    cookiePair(names.csrf, '', 0, false),
  ]);
}

export function clearAllMobileSessionCookies(res: Response) {
  res.setHeader('Set-Cookie', [
    cookiePair(NAMES.student.access, '', 0, true),
    cookiePair(NAMES.student.refresh, '', 0, true),
    cookiePair(NAMES.student.csrf, '', 0, false),
    cookiePair(NAMES.vendor.access, '', 0, true),
    cookiePair(NAMES.vendor.refresh, '', 0, true),
    cookiePair(NAMES.vendor.csrf, '', 0, false),
  ]);
}
