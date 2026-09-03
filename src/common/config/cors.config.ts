/**
 * Origines autorisées pour le CORS, pilotées par la variable d'environnement
 * CORS_ALLOWED_ORIGINS (liste séparée par des virgules), configurée sur Vercel.
 *
 * Pourquoi centraliser ici : ce fichier compilé (dist/src/common/config/cors.config.js)
 * est la SEULE source de vérité, importée à la fois par src/main.ts (app Nest) et par
 * api/index.js (handler serverless Vercel, qui répond aux OPTIONS avant même
 * d'atteindre Nest). Avant, les deux avaient leur propre liste en dur, désynchronisée :
 * ajouter un domaine dans l'un sans l'autre laissait le CORS cassé en production.
 *
 * Ne JAMAIS remettre de domaine en dur ici : tout changement de domaine frontend
 * (nouveau nom, preview Vercel, etc.) doit passer par la variable d'environnement,
 * pas par une modification de code + redéploiement.
 */
export function getAllowedOrigins(): string[] {
  const fromEnv = process.env.CORS_ALLOWED_ORIGINS;

  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  // Fallback de développement local uniquement (aucune variable définie).
  // En production, CORS_ALLOWED_ORIGINS doit toujours être configurée sur Vercel ;
  // ce fallback n'est pas censé être atteint en prod.
  return ['http://localhost:5173'];
}
