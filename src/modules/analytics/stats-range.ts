import { BadRequestException } from '@nestjs/common';

// Périodes des indicateurs d'administration (CDC 39 et 40) : toujours en UTC.
// `from` et `to` désignent des jours UTC, bornes incluses ; `to` couvre toute la journée.
export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UtcRange {
  since: Date;
  until: Date;
  dayKeys: string[];
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseInstant(raw: string, field: string): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} n'est pas une date valide`);
  return date;
}

/**
 * Résout l'intervalle demandé.
 * - Ni from ni to : les 30 derniers jours UTC, aujourd'hui compris.
 * - to seul : 30 jours se terminant à to. from seul : de from à aujourd'hui.
 * - Plus de 366 jours, ou from après to : 400.
 * `now` est injectable pour les tests.
 */
export function resolveUtcRange(from?: string, to?: string, now: Date = new Date()): UtcRange {
  const lastDay = to ? startOfUtcDay(parseInstant(to, 'to')) : startOfUtcDay(now);
  const firstDay = from
    ? startOfUtcDay(parseInstant(from, 'from'))
    : new Date(lastDay.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);

  if (firstDay.getTime() > lastDay.getTime()) {
    throw new BadRequestException('from doit être antérieur ou égal à to');
  }
  const totalDays = Math.round((lastDay.getTime() - firstDay.getTime()) / DAY_MS) + 1;
  if (totalDays > MAX_RANGE_DAYS) {
    throw new BadRequestException(`L'intervalle ne peut pas dépasser ${MAX_RANGE_DAYS} jours (${totalDays} demandés)`);
  }

  const dayKeys: string[] = [];
  for (let i = 0; i < totalDays; i++) dayKeys.push(utcDayKey(new Date(firstDay.getTime() + i * DAY_MS)));

  return {
    since: firstDay,
    until: new Date(lastDay.getTime() + DAY_MS - 1),
    dayKeys,
  };
}
