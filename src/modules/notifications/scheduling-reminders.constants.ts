// Rappel de programmation (CDC 41) : chaque étudiant actif est rappelé tous les X jours.
export const SCHEDULING_REMINDER_INTERVAL_DAYS = 3;

// Étudiants lus par lot, et plafond par passage du cron.
export const SCHEDULING_REMINDER_BATCH_SIZE = 200;
export const SCHEDULING_REMINDER_PASS_LIMIT = 2000;

// Notifications envoyées en parallèle à l'intérieur d'un lot.
export const SCHEDULING_REMINDER_CONCURRENCY = 20;
