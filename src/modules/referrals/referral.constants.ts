// Parrainage (CDC 42) : tickets crédités au parrain quand son filleul effectue
// sa première recharge réussie. Unique source du montant.
export const REFERRAL_REWARD_TICKETS = 100;

// Code de parrainage : 8 caractères, majuscules et chiffres, sans caractères
// ambigus (ni 0, O, 1, I). 32 symboles : un octet aléatoire se réduit sans biais.
export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Nombre maximal d'essais avant d'abandonner la génération d'un code unique.
export const REFERRAL_CODE_MAX_ATTEMPTS = 10;
