import { and, asc, eq, isNull, isNotNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { immoRentals, immoRentInvoices, companies } from '../db/schema';
import { env } from '../env';
import { logger } from '../logger';
import { emitInvalidate } from '../realtime/socket';
import { sendDiscordDM, buildRentReminderEmbed, buildRentOverdueEmbed } from './discordBot';

// Lundi (00:00) de la semaine courante, au format YYYY-MM-DD.
function currentWeekMonday(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Génère le loyer de la semaine courante pour toutes les locations en auto-génération.
// Idempotent (contrainte UNIQUE(rental_id, week_start)) : un loyer n'est créé qu'une fois par semaine.
// Envoie le rappel Discord RP uniquement quand un NOUVEAU loyer est réellement créé.
export async function runRentAutoGeneration(): Promise<{ created: number; reminders: number }> {
  const weekStart = currentWeekMonday();
  const rows = await db
    .select({
      id: immoRentals.id,
      companyId: immoRentals.companyId,
      propertyRef: immoRentals.propertyRef,
      tenantName: immoRentals.tenantName,
      weeklyRent: immoRentals.weeklyRent,
      reminderEnabled: immoRentals.reminderEnabled,
      tenantDiscordId: immoRentals.tenantDiscordId,
      agencyName: companies.name,
    })
    .from(immoRentals)
    .innerJoin(companies, eq(immoRentals.companyId, companies.id))
    .where(and(eq(immoRentals.autoGenerate, true), eq(immoRentals.status, 'active')));

  let created = 0;
  let reminders = 0;
  const touchedCompanies = new Set<number>();

  for (const r of rows) {
    let inserted = false;
    try {
      await db.insert(immoRentInvoices).values({
        companyId: r.companyId,
        rentalId: r.id,
        weekStart,
        amount: r.weeklyRent,
        status: 'impaye',
      });
      inserted = true;
    } catch {
      continue; // loyer déjà généré cette semaine
    }
    if (!inserted) continue;
    created += 1;
    touchedCompanies.add(r.companyId);

    if (r.reminderEnabled && r.tenantDiscordId) {
      const ok = await sendDiscordDM(
        r.tenantDiscordId,
        buildRentReminderEmbed({
          agencyName: r.agencyName ?? 'Agence immobilière',
          propertyRef: r.propertyRef,
          tenantName: r.tenantName,
          amount: Number(r.weeklyRent),
          weekStart,
        }),
      );
      if (ok) {
        reminders += 1;
        await db.update(immoRentals).set({ lastReminderAt: sql`NOW()` }).where(eq(immoRentals.id, r.id));
      }
    }
  }

  for (const cid of touchedCompanies) {
    emitInvalidate(['irs', `company:${cid}`], [['immo-rentals', cid]]);
  }
  if (created) logger.info({ created, reminders, weekStart }, 'auto-génération loyers');
  return { created, reminders };
}

const RELANCE_THROTTLE_DAYS = 3;

// Relance les locataires dont un ou plusieurs loyers de semaines PASSÉES sont encore impayés.
// Throttlé à 1 relance / 3 jours par location. Nécessite le bot Discord (sinon no-op).
export async function runRentReminders(): Promise<{ sent: number }> {
  if (!env.DISCORD_BOT_TOKEN) return { sent: 0 };
  const monday = currentWeekMonday();
  const rentals = await db
    .select({
      id: immoRentals.id,
      propertyRef: immoRentals.propertyRef,
      tenantName: immoRentals.tenantName,
      tenantDiscordId: immoRentals.tenantDiscordId,
      agencyName: companies.name,
    })
    .from(immoRentals)
    .innerJoin(companies, eq(immoRentals.companyId, companies.id))
    .where(
      and(
        eq(immoRentals.reminderEnabled, true),
        eq(immoRentals.status, 'active'),
        isNotNull(immoRentals.tenantDiscordId),
        or(
          isNull(immoRentals.lastReminderAt),
          lt(immoRentals.lastReminderAt, sql`DATE_SUB(NOW(), INTERVAL ${RELANCE_THROTTLE_DAYS} DAY)`),
        ),
      ),
    );

  let sent = 0;
  for (const r of rentals) {
    // loyers en retard = impayés d'une semaine strictement antérieure à la semaine courante
    const overdue = await db
      .select({ weekStart: immoRentInvoices.weekStart, amount: immoRentInvoices.amount })
      .from(immoRentInvoices)
      .where(
        and(
          eq(immoRentInvoices.rentalId, r.id),
          eq(immoRentInvoices.status, 'impaye'),
          lt(immoRentInvoices.weekStart, monday),
        ),
      )
      .orderBy(asc(immoRentInvoices.weekStart));
    if (!overdue.length) continue;

    const ok = await sendDiscordDM(
      r.tenantDiscordId!,
      buildRentOverdueEmbed({
        agencyName: r.agencyName ?? 'Agence immobilière',
        propertyRef: r.propertyRef,
        tenantName: r.tenantName,
        totalDue: overdue.reduce((s, i) => s + Number(i.amount), 0),
        weeksLate: overdue.length,
        oldestWeek: overdue[0]!.weekStart as unknown as string,
      }),
    );
    // On throttle même si l'envoi échoue (MP fermés) pour éviter les tentatives en boucle.
    await db.update(immoRentals).set({ lastReminderAt: sql`NOW()` }).where(eq(immoRentals.id, r.id));
    if (ok) sent += 1;
  }
  if (sent) logger.info({ sent }, 'relances loyers en retard');
  return { sent };
}
