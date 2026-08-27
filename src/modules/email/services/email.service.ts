import { Injectable, Logger } from '@nestjs/common';

/**
 * ⚠️ STUB — aucun fournisseur d'email n'est branché pour le moment.
 *
 * Cette implémentation se contente de logger le lien côté serveur. Elle
 * existe pour que le flux de réinitialisation de mot de passe soit
 * fonctionnel de bout en bout en développement, SANS bloquer le reste de
 * l'implémentation en attendant un choix de fournisseur.
 *
 * Pour brancher un vrai envoi, remplacer le corps de sendPasswordResetEmail
 * ci-dessous par un appel au SDK du fournisseur choisi (Resend, SendGrid,
 * Amazon SES, Brevo, ou SMTP via nodemailer). L'interface (nom de méthode,
 * signature) ne change pas — aucun appelant n'a besoin d'être modifié.
 *
 * ⚠️ Tant que ce stub est actif, AUCUN email n'est réellement envoyé :
 * l'utilisateur ne recevra jamais de lien de réinitialisation en production.
 * Ne pas déployer ce module en l'état sur un environnement de production
 * accessible aux utilisateurs finaux.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    this.logger.warn(
      `[STUB EMAIL — aucun envoi réel] Lien de réinitialisation pour ${to} : ${resetUrl}`,
    );
    // TODO: remplacer par l'appel réel au fournisseur choisi, par ex. :
    //
    //   await this.resend.emails.send({
    //     from: 'kabakaba <no-reply@kabakaba.app>',
    //     to,
    //     subject: 'Réinitialisation de votre mot de passe kabakaba',
    //     html: `<p>Cliquez sur ce lien (valide 15 minutes) : <a href="${resetUrl}">${resetUrl}</a></p>`,
    //   });
  }
}
