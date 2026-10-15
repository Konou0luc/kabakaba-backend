/** Longueur du code PIN étudiant (alignée sur le parcours vendeur / PWA). */
export const STUDENT_PIN_LENGTH = 4;

/** Échecs consécutifs tolérés avant verrouillage temporaire du PIN. */
export const STUDENT_PIN_MAX_ATTEMPTS = 5;

/** Durée du verrouillage déclenché par STUDENT_PIN_MAX_ATTEMPTS échecs. */
export const STUDENT_PIN_LOCK_MS = 15 * 60 * 1000;

/**
 * Durée de vie du jeton d’étape « pose du PIN » après OTP.
 * Assez longue pour saisir / confirmer le code, assez courte pour limiter
 * la fenêtre d’abus si le jeton fuit.
 */
export const STUDENT_PIN_SETUP_TOKEN_TTL = '10m';

/** Scope JWT des jetons d’étape — jamais accepté comme access token. */
export const STUDENT_SCOPE_PIN_SETUP = 'student_pin_setup';
