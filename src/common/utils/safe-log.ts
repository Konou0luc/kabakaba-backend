/** Masque les identifiants personnels dans les logs applicatifs. */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '[redacted]';
  const normalized = String(phone);
  if (normalized.length <= 4) return '***';
  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return 'Erreur inattendue';
}
