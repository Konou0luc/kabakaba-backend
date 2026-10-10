import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import {
  DEFAULT_UNCLAIMED_ORDER_DELAY_MINUTES,
  UNCLAIMED_ORDER_DELAY_ENV,
  parseUnclaimedDelayMinutes,
} from '../unclaimed-orders.config';

/**
 * Commandes non récupérées (CDC 30). Le signalement sert uniquement à la mesure et aux
 * statistiques : aucun changement de statut, aucune sanction, aucun remboursement,
 * aucune notification, aucun mouvement de stock.
 */
@Injectable()
export class UnclaimedOrdersService {
  private readonly logger = new Logger(UnclaimedOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Signale, en UNE SEULE mise à jour conditionnelle, les commandes `READY` pas encore
   * signalées dont `readyAt` remonte à plus que le délai. Idempotent : une commande déjà
   * signalée (`unclaimedAt` renseigné) n'est jamais modifiée, et une commande qui a quitté
   * `READY` n'est jamais concernée. Renvoie le nombre de commandes signalées.
   */
  async flagUnclaimed(): Promise<number> {
    const delayMinutes = this.delayMinutes();
    const now = new Date();
    const cutoff = new Date(now.getTime() - delayMinutes * 60_000);

    const { count } = await this.prisma.order.updateMany({
      where: { status: OrderStatus.READY, unclaimedAt: null, readyAt: { lte: cutoff } },
      data: { unclaimedAt: now },
    });
    return count;
  }

  // Valeur invalide ou absente : retombe sur le défaut (60), avec un avertissement si une
  // valeur était bien fournie.
  private delayMinutes(): number {
    const raw = this.config.get<string>(UNCLAIMED_ORDER_DELAY_ENV);
    const parsed = parseUnclaimedDelayMinutes(raw);
    if (parsed !== null) return parsed;
    if (raw?.trim()) {
      this.logger.warn(
        `${UNCLAIMED_ORDER_DELAY_ENV}="${raw}" invalide (entier positif attendu) : défaut de ${DEFAULT_UNCLAIMED_ORDER_DELAY_MINUTES} minutes utilisé`,
      );
    }
    return DEFAULT_UNCLAIMED_ORDER_DELAY_MINUTES;
  }
}
