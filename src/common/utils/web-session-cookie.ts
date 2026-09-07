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

export function getWebSessionToken(req: Request): string | null {
  return parseCookies(req.headers.cookie)[WEB_SESSION_COOKIE] ?? null;
}

export function getCsrfCookie(req: Request): string | null {
  return parseCookies(req.headers.cookie)[WEB_CSRF_COOKIE] ?? null;
}

function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function sameSite(): 'lax' | 'strict' | 'none' {
  const envValue = (process.env.WEB_AUTH_COOKIE_SAMESITE || '').toLowerCase();
  if (envValue === 'strict' || envValue === 'none' || envValue === 'lax') return envValue;
  // Pas de valeur explicite en env : on choisit un défaut qui correspond à
  // la topologie réelle du déploiement plutôt qu'un défaut générique.
  //
  // En production, le frontend (ex: ka-bakaba.vercel.app) et ce backend
  // (ex: kabakaba-backend.vercel.app) sont deux PROJETS VERCEL DISTINCTS —
  // deux sous-domaines de vercel.app, qui est lui-même inscrit sur la
  // Public Suffix List. Ce sont donc deux sites différents au sens des
  // cookies, pas seulement deux origines. Or un cookie SameSite=Lax n'est
  // JAMAIS envoyé sur un fetch()/XHR cross-site (seulement lors d'une
  // navigation top-level) : avec 'lax' par défaut, le cookie de session
  // était bien posé après le login, mais toute requête API suivante
  // repartait sans lui — 401 silencieux et systématique sur tout le
  // dashboard. D'où le défaut 'none' (+ Secure, obligatoire et garanti par
  // isProduction() ci-dessous) en prod.
  //
  // En local, frontend et backend tournent tous les deux sur `localhost`
  // (ports différents) : c'est le même site au sens SameSite, donc 'lax'
  // convient et évite d'exiger HTTPS en développement.
  return isProduction() ? 'none' : 'lax';
}

export function issueWebSessionCookies(res: Response, accessToken: string) {
  const csrf = crypto.randomBytes(32).toString('base64url');
  const secure = isProduction() || process.env.WEB_AUTH_COOKIE_SECURE === 'true';
  const same = sameSite();
  if (same === 'none' && !secure) throw new Error('WEB_AUTH_COOKIE_SAMESITE=none exige WEB_AUTH_COOKIE_SECURE=true');
  // `Secure` et `HttpOnly` sont des drapeaux booléens dans Set-Cookie : ils
  // doivent apparaître nus ("Secure"), jamais sous forme "Secure=true". Un
  // navigateur conforme à la spec ignore silencieusement un attribut qu'il
  // ne reconnaît pas — "Secure=true" n'active donc PAS le flag Secure, et
  // le cookie de session partait sans cette protection en production.
  const securePart = secure ? '; Secure' : '';
  const common = `Path=/; Max-Age=${8 * 60 * 60}; HttpOnly${securePart}; SameSite=${same}`;
  const csrfCommon = `Path=/; Max-Age=${8 * 60 * 60}${securePart}; SameSite=${same}`;
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
