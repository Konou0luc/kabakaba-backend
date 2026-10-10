// Règles des commandes programmées (CDC 29). Un seul endroit pour les ajuster.

// L'heure prévue doit être au moins X minutes dans le futur...
export const SCHEDULE_MIN_LEAD_MINUTES = 15;
// ... et au plus X heures dans le futur.
export const SCHEDULE_MAX_LEAD_HOURS = 24;
// Nombre maximum de commandes programmées en attente (PENDING) par étudiant.
export const MAX_PENDING_SCHEDULED_ORDERS_PER_STUDENT = 5;

// Nombre maximum de commandes programmées traitées par passage du cron. La fonction
// Vercel qui l'exécute est limitée à 30 secondes (vercel.json) et chaque commande est
// traitée dans sa propre transaction, l'une après l'autre : un lot trop grand risquerait
// de dépasser cette limite. Les commandes restantes sont reprises au passage suivant.
export const EXECUTION_BATCH_SIZE = 20;
