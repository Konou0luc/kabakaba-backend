/** Longueur du code PIN vendeur, telle que définie par la maquette mobile. */
export const VENDOR_PIN_LENGTH = 4;

/** Échecs consécutifs tolérés avant verrouillage temporaire du PIN. */
export const VENDOR_PIN_MAX_ATTEMPTS = 5;

/** Durée du verrouillage déclenché par VENDOR_PIN_MAX_ATTEMPTS échecs. */
export const VENDOR_PIN_LOCK_MS = 15 * 60 * 1000;

/**
 * Durée de vie des jetons d'étape du parcours d'activation. Assez large pour
 * laisser le temps de recevoir un SMS et de saisir un PIN, assez courte pour
 * qu'un jeton intercepté ne soit pas réutilisable plus tard.
 */
export const VENDOR_ONBOARDING_TOKEN_TTL = '10m';

export const VENDOR_SCOPE_ONBOARDING = 'vendor_onboarding';
export const VENDOR_SCOPE_PIN_SETUP = 'vendor_pin_setup';
