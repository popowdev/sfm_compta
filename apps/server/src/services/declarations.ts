import { computeCorporateTax } from '@rp-compta/shared';
import { getFiscalConfig } from './fiscal';

export interface ComputedTaxes {
  corporateTax: number;
  dividendTax: number;
  totalTax: number;
  dividendTaxRate: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function computeTaxes(benefit: number, dividends: number): Promise<ComputedTaxes> {
  const cfg = await getFiscalConfig();
  const corporateTax = computeCorporateTax(benefit, cfg.brackets);
  const dividendTax = round2((dividends * cfg.dividendTaxRate) / 100);
  return {
    corporateTax,
    dividendTax,
    totalTax: round2(corporateTax + dividendTax),
    dividendTaxRate: cfg.dividendTaxRate,
  };
}
