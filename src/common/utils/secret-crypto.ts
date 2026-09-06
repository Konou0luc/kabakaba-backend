import * as crypto from 'crypto';

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('TOTP_ENCRYPTION_KEY manquant — démarrage refusé pour des raisons de sécurité');
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY doit être une clé AES-256 de 32 octets (64 hex ou base64)');
  }
  return key;
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string): { value: string; wasEncrypted: boolean } {
  if (!value.startsWith(PREFIX)) return { value, wasEncrypted: false };
  const parts = value.slice(PREFIX.length).split('.');
  if (parts.length !== 3) throw new Error('Secret chiffré invalide');
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return { value: plain.toString('utf8'), wasEncrypted: true };
}
