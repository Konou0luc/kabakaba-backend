// Numéro de commande propre à chaque cantine (cahier V1.3, section 25) :
// une lettre de A à Z, un tiret, deux chiffres de 00 à 10 (ex. « A-05 »),
// soit 26 × 11 = 286 numéros par cantine, dans l'ordre A-00, A-01 … A-10, B-00 … Z-10.
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_NUMBER = 10;

export const ORDER_NUMBERS: readonly string[] = [...LETTERS].flatMap((letter) =>
  Array.from({ length: MAX_NUMBER + 1 }, (_, n) => `${letter}-${String(n).padStart(2, '0')}`),
);

// Plus petit numéro libre, ou null si les 286 numéros sont occupés.
export function pickOrderNumber(taken: Iterable<string>): string | null {
  const takenSet = new Set(taken);
  return ORDER_NUMBERS.find((number) => !takenSet.has(number)) ?? null;
}
