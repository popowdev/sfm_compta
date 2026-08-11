import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { moduleConfigBool } from '@rp-compta/shared';
import { db } from '../db';
import { companies, companyModules, concessionVehicles } from '../db/schema';
import { asyncHandler } from '../middleware/asyncHandler';
import { isModuleBlocked } from '../services/modules';

export const showroomRouter = Router();

showroomRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const token = String(req.params.token ?? '');
    if (!/^[a-f0-9]{32}$/.test(token)) return res.status(404).json({ error: 'not_found' });

    const companyRows = await db
      .select({ id: companies.id, name: companies.name, logoUrl: companies.logoUrl })
      .from(companies)
      .where(eq(companies.showroomToken, token))
      .limit(1);
    const company = companyRows[0];
    if (!company) return res.status(404).json({ error: 'not_found' });

    const moduleRows = await db
      .select({ enabled: companyModules.enabled, config: companyModules.config })
      .from(companyModules)
      .where(and(eq(companyModules.companyId, company.id), eq(companyModules.moduleKey, 'concession')))
      .limit(1);
    const mod = moduleRows[0];
    if (!mod || !mod.enabled) return res.status(404).json({ error: 'not_found' });
    if (await isModuleBlocked('concession')) return res.status(404).json({ error: 'not_found' });
    const cfg = (typeof mod.config === 'string' ? JSON.parse(mod.config) : mod.config) as Record<string, unknown> | null;
    if (!moduleConfigBool(cfg, 'concession', 'publicShowroom')) return res.status(404).json({ error: 'not_found' });

    const vehicleRows = await db
      .select({
        id: concessionVehicles.id,
        name: concessionVehicles.name,
        category: concessionVehicles.category,
        type: concessionVehicles.type,
        salePrice: concessionVehicles.salePrice,
        imageUrl: concessionVehicles.imageUrl,
        description: concessionVehicles.description,
      })
      .from(concessionVehicles)
      .where(and(eq(concessionVehicles.companyId, company.id), eq(concessionVehicles.showroom, true), eq(concessionVehicles.available, true)))
      .orderBy(asc(concessionVehicles.sortOrder), asc(concessionVehicles.name));

    res.json({
      company: { name: company.name, logoUrl: company.logoUrl },
      vehicles: vehicleRows.map((v) => ({
        id: v.id,
        name: v.name,
        category: v.category,
        type: v.type,
        salePrice: Math.round(Number(v.salePrice)),
        imageUrl: v.imageUrl,
        description: v.description,
      })),
    });
  }),
);
