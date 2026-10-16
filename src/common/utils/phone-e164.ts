import { Transform } from 'class-transformer';

const TOGO_CALLING_CODE = '228';
const LOCAL_LENGTH = 8;

/**
 * Forme canonique d'un numéro togolais : `+228` suivi de 8 chiffres, sans
 * espace. L'admin, la PWA et la recherche en base doivent partager cette
 * chaîne, sinon `User.phone` (unique, égalité stricte) rate le compte.
 *
 * Accepte `90 12 34 56`, `90123456`, `22890123456`, `+228 90 12 34 56`.
 * Retourne null si le nombre de chiffres ne correspond pas : on ne tronque
 * pas, pour ne pas rattacher la connexion au mauvais compte.
 */
export function toTogoE164(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (
    digits.startsWith(TOGO_CALLING_CODE) &&
    digits.length === TOGO_CALLING_CODE.length + LOCAL_LENGTH
  ) {
    return `+${digits}`;
  }

  if (digits.length === LOCAL_LENGTH) {
    return `+${TOGO_CALLING_CODE}${digits}`;
  }

  return null;
}

/** Réécrit le champ en E.164 avant la validation, quand c'est possible. */
export function NormalizeTogoPhone(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return toTogoE164(trimmed) ?? trimmed;
  });
}
