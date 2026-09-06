import * as crypto from 'crypto';
import type { Request, Response } from 'express';

export const WEB_SESSION_COOKIE = 'kabakaba_web_session';
export const WEB_CSRF_COOKIE = 'kabakaba_web_csrf';

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string,string>>((acc, part) => {
    const index = part.indexOf('=');
    if (index < 0) return acc;
    const key = part.slice(0,index).trim();
    const value = part.slice(index+1).trim();
    try { acc[key] = decodeURIComponent(value); } catch { acc[key] = value; }
    return acc;
  }, {});
}

export function getWebSessionToken(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[WEB_SESSION_COOKIE];
}

export function getCsrfCookie(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[WEB_CSRF_COOKIE];
}

function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function sameSite(): 'lax' | 'strict' | 'none' {
  const value = (process.env.WEB_AUTH_COOKIE_SAMESITE || 'lax').toLowerCase();
  if (value === 'strict' || value === 'none') return value;
  return 'lax';
}

export function issueWebSessionCookies(res: Response, accessToken: string) {
  const csrf = crypto.randomBytes(32).toString('base64url');
  const secure = isProduction() || process.env.WEB_AUTH_COOKIE_SECURE === 'true';
  const same = sameSite();
  if (same === 'none' && !secure) throw new Error('WEB_AUTH_COOKIE_SAMESITE=none exige WEB_AUTH_COOKIE_SECURE=true');
  const common = `Path=/; Max-Age=${8 * 60 * 60}; HttpOnly; Secure=${secure}; SameSite=${same}`.replace('; Secure=false','');
  const csrfCommon = `Path=/; Max-Age=${8 * 60 * 60}; Secure=${secure}; SameSite=${same}`.replace('; Secure=false','');
  res.setHeader('Set-Cookie', [
    `${WEB_SESSION_COOKIE}=${encodeURIComponent(accessToken)}; ${common}`,
    `${WEB_CSRF_COOKIE}=${encodeURIComponent(csrf)}; ${csrfCommon}`,
  ]);
  return csrf;
}

export function clearWebSessionCookies(res: Response) {
  const secure = isProduction() || process.env.WEB_AUTH_COOKIE_SECURE === 'true';
  const same = sameSite();
  const securePart = secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `${WEB_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly${securePart}; SameSite=${same}`,
    `${WEB_CSRF_COOKIE}=; Path=/; Max-Age=0${securePart}; SameSite=${same}`,
  ]);
}
