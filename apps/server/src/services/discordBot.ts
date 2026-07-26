import { env } from '../env';
import { logger } from '../logger';

const API = 'https://discord.com/api/v10';

// Envoie un message privé (MP) à un utilisateur Discord via le bot.
// Nécessite DISCORD_BOT_TOKEN (le bot doit partager un serveur avec le joueur).
// Retourne false silencieusement si le token est absent ou si l'envoi échoue.
export async function sendDiscordDM(userId: string, embed: Record<string, unknown>): Promise<boolean> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.warn('sendDiscordDM: DISCORD_BOT_TOKEN absent — MP ignoré');
    return false;
  }
  if (!/^\d{5,25}$/.test(userId)) return false;
  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
  try {
    const chRes = await fetch(`${API}/users/@me/channels`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipient_id: userId }),
    });
    if (!chRes.ok) {
      logger.warn({ status: chRes.status }, 'sendDiscordDM: création du canal MP échouée');
      return false;
    }
    const ch = (await chRes.json()) as { id: string };
    const msgRes = await fetch(`${API}/channels/${ch.id}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!msgRes.ok) {
      logger.warn({ status: msgRes.status }, 'sendDiscordDM: envoi du MP échoué (le joueur bloque peut-être les MP)');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, 'sendDiscordDM: erreur réseau');
    return false;
  }
}

export interface RentReminderInput {
  agencyName: string;
  propertyRef: string;
  tenantName: string | null;
  amount: number;
  weekStart: string;
}

// Avis de loyer RP, style courrier officiel d'agence immobilière.
export function buildRentReminderEmbed(i: RentReminderInput): Record<string, unknown> {
  const montant = new Intl.NumberFormat('fr-FR').format(Math.round(i.amount));
  const date = (() => {
    const d = new Date(`${i.weekStart}T00:00:00`);
    return Number.isNaN(d.getTime()) ? i.weekStart : d.toLocaleDateString('fr-FR');
  })();
  const nom = i.tenantName ? ` ${i.tenantName}` : '';
  return {
    author: { name: `${i.agencyName} — Service de gestion locative` },
    title: '📜 Avis de loyer',
    description:
      `Bonjour${nom},\n\n` +
      `Nous vous informons que le loyer de votre résidence **n°${i.propertyRef}** est arrivé à échéance ` +
      `pour la semaine du **${date}**.\n\n` +
      `Nous vous prions de bien vouloir vous acquitter du montant dû dans les meilleurs délais ` +
      `auprès de votre agent afin d'éviter toute procédure de recouvrement.\n\n` +
      `En vous remerciant de votre confiance,\n*La direction de ${i.agencyName}.*`,
    color: 0xf59e0b,
    fields: [
      { name: 'Bien', value: `n°${i.propertyRef}`, inline: true },
      { name: 'Montant dû', value: `${montant} $`, inline: true },
      { name: 'Échéance', value: `Semaine du ${date}`, inline: true },
    ],
    footer: { text: 'Ce message est une notification automatique. Merci de ne pas y répondre.' },
  };
}

export interface RentOverdueInput {
  agencyName: string;
  propertyRef: string;
  tenantName: string | null;
  totalDue: number;
  weeksLate: number;
  oldestWeek: string;
}

// Relance RP pour un ou plusieurs loyers déjà en retard — ton plus ferme.
export function buildRentOverdueEmbed(i: RentOverdueInput): Record<string, unknown> {
  const montant = new Intl.NumberFormat('fr-FR').format(Math.round(i.totalDue));
  const oldest = (() => {
    const d = new Date(`${i.oldestWeek}T00:00:00`);
    return Number.isNaN(d.getTime()) ? i.oldestWeek : d.toLocaleDateString('fr-FR');
  })();
  const nom = i.tenantName ? ` ${i.tenantName}` : '';
  const sLate = i.weeksLate > 1 ? 's' : '';
  return {
    author: { name: `${i.agencyName} — Service de recouvrement` },
    title: '⚠️ Relance — loyer en retard',
    description:
      `Bonjour${nom},\n\n` +
      `Sauf erreur de notre part, votre résidence **n°${i.propertyRef}** présente **${i.weeksLate} loyer${sLate} impayé${sLate}** ` +
      `pour un total de **${montant} $**, le plus ancien remontant à la semaine du **${oldest}**.\n\n` +
      `Nous vous invitons à régulariser votre situation **sans délai** auprès de votre agent. ` +
      `À défaut, l'agence se réserve le droit d'engager une procédure d'expulsion et de résiliation du bail.\n\n` +
      `Comptant sur votre diligence,\n*Le service de recouvrement de ${i.agencyName}.*`,
    color: 0xef4444,
    fields: [
      { name: 'Bien', value: `n°${i.propertyRef}`, inline: true },
      { name: 'Total dû', value: `${montant} $`, inline: true },
      { name: 'Retard', value: `${i.weeksLate} sem. (dep. ${oldest})`, inline: true },
    ],
    footer: { text: 'Notification automatique. Merci de régulariser au plus vite.' },
  };
}
