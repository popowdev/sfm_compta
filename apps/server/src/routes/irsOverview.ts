import { Router } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { companies, associations, subventions, declarations, messages, shareholders } from '../db/schema';
import { requireAuth, requireAppRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

export const irsOverviewRouter = Router();
irsOverviewRouter.use(requireAuth, requireAppRole('irs'));

irsOverviewRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [companyRows, assocRows] = await Promise.all([
      db.select({ n: sql<number>`COUNT(*)` }).from(companies).where(and(isNull(companies.deletedAt), eq(companies.active, true))),
      db.select({ n: sql<number>`COUNT(*)` }).from(associations),
    ]);

    const pendingSubs = await db
      .select({ sub: subventions, companyName: companies.name })
      .from(subventions)
      .innerJoin(companies, eq(subventions.companyId, companies.id))
      .where(eq(subventions.status, 'pending'))
      .orderBy(desc(subventions.createdAt))
      .limit(8);

    const submittedDecls = await db
      .select({ d: declarations, companyName: companies.name })
      .from(declarations)
      .innerJoin(companies, eq(declarations.companyId, companies.id))
      .where(and(eq(declarations.status, 'submitted'), isNull(declarations.archivedAt)))
      .orderBy(desc(declarations.createdAt))
      .limit(8);

    const taxRow = await db
      .select({ t: sql<string>`COALESCE(SUM(${declarations.totalTax}), 0)` })
      .from(declarations)
      .where(and(eq(declarations.status, 'paid'), isNull(declarations.archivedAt)));
    const caRow = await db
      .select({ t: sql<string>`COALESCE(SUM(${declarations.caNet}), 0)` })
      .from(declarations)
      .where(isNull(declarations.archivedAt));

    const pendingSubCount = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(subventions)
      .where(eq(subventions.status, 'pending'));
    const submittedDeclCount = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(declarations)
      .where(and(eq(declarations.status, 'submitted'), isNull(declarations.archivedAt)));

    const recentMessages = await db
      .select({ m: messages, companyName: companies.name })
      .from(messages)
      .innerJoin(companies, eq(messages.companyId, companies.id))
      .orderBy(desc(messages.createdAt))
      .limit(6);

    const shareRows = await db
      .select({
        id: companies.id,
        name: companies.name,
        valuation: companies.valuation,
        count: sql<number>`COUNT(${shareholders.id})`,
        pct: sql<string>`COALESCE(SUM(${shareholders.percentage}), 0)`,
      })
      .from(companies)
      .leftJoin(shareholders, eq(shareholders.companyId, companies.id))
      .where(and(isNull(companies.deletedAt), eq(companies.active, true)))
      .groupBy(companies.id, companies.name, companies.valuation)
      .orderBy(desc(companies.valuation))
      .limit(12);

    res.json({
      kpis: {
        companies: Number(companyRows[0]?.n ?? 0),
        associations: Number(assocRows[0]?.n ?? 0),
        pendingSubventions: Number(pendingSubCount[0]?.n ?? 0),
        submittedDeclarations: Number(submittedDeclCount[0]?.n ?? 0),
        taxesCollected: Number(taxRow[0]?.t ?? 0),
        caDeclared: Number(caRow[0]?.t ?? 0),
      },
      pendingSubventions: pendingSubs.map((r) => ({
        id: r.sub.id,
        companyName: r.companyName,
        motif: r.sub.motif,
        amountRequested: Number(r.sub.amountRequested),
        createdAt: r.sub.createdAt,
      })),
      submittedDeclarations: submittedDecls.map((r) => ({
        id: r.d.id,
        companyName: r.companyName,
        weekLabel: r.d.weekLabel,
        totalTax: Number(r.d.totalTax),
        createdAt: r.d.createdAt,
      })),
      recentMessages: recentMessages.map((r) => ({
        id: r.m.id,
        companyName: r.companyName,
        fromIrs: r.m.fromIrs,
        senderName: r.m.senderName,
        body: r.m.body.slice(0, 90),
        createdAt: r.m.createdAt,
      })),
      companiesShares: shareRows.map((r) => ({
        id: r.id,
        name: r.name,
        valuation: Number(r.valuation),
        shareholderCount: Number(r.count),
        attributedPct: Math.round(Number(r.pct) * 100) / 100,
      })),
    });
  }),
);
