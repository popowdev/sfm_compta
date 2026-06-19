import { asc, eq } from 'drizzle-orm';
import type { FiscalConfig, TaxBracket } from '@rp-compta/shared';
import { db } from '../db';
import { fiscalConfig, taxBrackets } from '../db/schema';

const SINGLETON_ID = 1;

const DEFAULT_BRACKETS: TaxBracket[] = [
  { min: 0, max: 5000, rate: 1 },
  { min: 5000, max: 10000, rate: 4 },
  { min: 10000, max: 20000, rate: 9 },
  { min: 20000, max: 30000, rate: 13 },
  { min: 30000, max: 50000, rate: 18 },
  { min: 50000, max: 80000, rate: 25 },
  { min: 80000, max: 100000, rate: 35 },
  { min: 100000, max: 200000, rate: 40 },
  { min: 200000, max: 500000, rate: 45 },
  { min: 500000, max: null, rate: 50 },
];

export async function getFiscalConfig(): Promise<FiscalConfig> {
  const cfgRows = await db
    .select()
    .from(fiscalConfig)
    .where(eq(fiscalConfig.id, SINGLETON_ID))
    .limit(1);

  let dividendTaxRate = 33;
  if (!cfgRows[0]) {
    await db.insert(fiscalConfig).values({ id: SINGLETON_ID, dividendTaxRate: '33' });
  } else {
    dividendTaxRate = Number(cfgRows[0].dividendTaxRate);
  }

  const bracketRows = await db
    .select()
    .from(taxBrackets)
    .orderBy(asc(taxBrackets.sortOrder), asc(taxBrackets.minAmount));

  let brackets: TaxBracket[] = bracketRows.map((r) => ({
    min: Number(r.minAmount),
    max: r.maxAmount === null ? null : Number(r.maxAmount),
    rate: Number(r.rate),
  }));

  if (bracketRows.length === 0) {
    await db.insert(taxBrackets).values(
      DEFAULT_BRACKETS.map((b, i) => ({
        minAmount: String(b.min),
        maxAmount: b.max === null ? null : String(b.max),
        rate: String(b.rate),
        sortOrder: i,
      })),
    );
    brackets = DEFAULT_BRACKETS;
  }

  return { dividendTaxRate, brackets };
}

export async function replaceFiscalConfig(config: FiscalConfig): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(fiscalConfig)
      .values({ id: SINGLETON_ID, dividendTaxRate: String(config.dividendTaxRate) })
      .onDuplicateKeyUpdate({ set: { dividendTaxRate: String(config.dividendTaxRate) } });
    await tx.delete(taxBrackets);
    if (config.brackets.length) {
      await tx.insert(taxBrackets).values(
        config.brackets.map((b, i) => ({
          minAmount: String(b.min),
          maxAmount: b.max === null ? null : String(b.max),
          rate: String(b.rate),
          sortOrder: i,
        })),
      );
    }
  });
}
