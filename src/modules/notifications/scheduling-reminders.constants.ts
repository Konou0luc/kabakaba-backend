// Rappel de programmation (CDC 41) : chaque étudiant actif est rappelé tous les X jours.
export const SCHEDULING_REMINDER_INTERVAL_DAYS = 3;

// Tolérance sur cet intervalle : un étudiant est éligible dès que son dernier rappel date de
// (INTERVAL_DAYS jours - TOLERANCE_HOURS heures). Le cron passe une fois par jour, mais l'heure
// du passage varie de quelques secondes à quelques minutes d'un jour à l'autre (retard de la
// planification GitHub). Sans tolérance, un passage légèrement en avance sur celui d'il y a 3 jours
// trouverait le dernier rappel trop récent et le rappel glisserait au 4e jour. Avec un passage
// quotidien, 6 heures ne peuvent jamais provoquer un rappel avant le 3e jour : le passage du 2e jour
// est à environ 48 heures du dernier rappel, bien en dessous de 66 heures.
export const SCHEDULING_REMINDER_TOLERANCE_HOURS = 6;

// Étudiants lus par lot, et plafond par passage du cron.
export const SCHEDULING_REMINDER_BATCH_SIZE = 200;
export const SCHEDULING_REMINDER_PASS_LIMIT = 2000;

// Notifications envoyées en parallèle à l'intérieur d'un lot.
export const SCHEDULING_REMINDER_CONCURRENCY = 20;
