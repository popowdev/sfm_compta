import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getImmoSettings } from '@/lib/immoSettings';
import { fmtMoney } from '@/lib/declarations';
import type { PricingDetail } from '@/lib/immo';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-xs font-medium text-muted-foreground';

export function PricingCalculator({
  companyId, kind, initial, onChange,
}: {
  companyId: number;
  kind: 'location' | 'vente';
  initial: PricingDetail | null;
  onChange: (d: PricingDetail | null) => void;
}) {
  const q = useQuery({ queryKey: ['immo-settings', companyId], queryFn: () => getImmoSettings(companyId) });
  const types = kind === 'location' ? q.data?.locationTypes ?? [] : q.data?.venteTypes ?? [];
  const options = kind === 'location' ? q.data?.locationOptions ?? [] : q.data?.venteOptions ?? [];
  const discounts = q.data?.discounts ?? [];

  const [typeKey, setTypeKey] = useState(initial?.typeKey ?? '');
  const [basePrice, setBasePrice] = useState(initial ? String(initial.basePrice) : '');
  const [opts, setOpts] = useState<Set<string>>(new Set(initial?.options ?? []));
  const [roles, setRoles] = useState<Set<string>>(new Set(initial?.roleDiscounts ?? []));
  const [reduction, setReduction] = useState(initial?.reduction ? String(initial.reduction) : '');
  const [reductionType, setReductionType] = useState<'amount' | 'percent'>(initial?.reductionType ?? 'amount');
  const [frais, setFrais] = useState(initial?.frais ? String(initial.frais) : '');
  const [fraisType, setFraisType] = useState<'amount' | 'percent'>(initial?.fraisType ?? 'amount');
  const [manual, setManual] = useState<string | null>(initial ? String(initial.finalPrice) : null);

  const base = Number(basePrice) || 0;
  const sumOpt = options.filter((o) => opts.has(o.name)).reduce((s, o) => s + o.pct, 0);
  const sumRole = discounts.filter((d) => roles.has(d.name)).reduce((s, d) => s + d.pct, 0);
  const red = Number(reduction) || 0;
  const fr = Number(frais) || 0;
  const computed = useMemo(() => {
    let p = base * (1 + sumOpt / 100);
    p = p * (1 - sumRole / 100);
    p = reductionType === 'percent' ? p * (1 - red / 100) : p - red;
    p = fraisType === 'percent' ? p * (1 + fr / 100) : p + fr;
    return Math.max(0, Math.round(p));
  }, [base, sumOpt, sumRole, red, reductionType, fr, fraisType]);

  const finalPrice = manual !== null && manual !== '' ? Math.round(Number(manual) || 0) : computed;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const optsKey = [...opts].sort().join('|');
  const rolesKey = [...roles].sort().join('|');
  const engaged = base > 0 || (manual !== null && manual !== '');
  useEffect(() => {
    if (!engaged) {
      onChangeRef.current(null);
      return;
    }
    onChangeRef.current({
      typeKey: typeKey || null, basePrice: base,
      options: optsKey ? optsKey.split('|') : [],
      roleDiscounts: rolesKey ? rolesKey.split('|') : [],
      reduction: red, reductionType, frais: fr, fraisType, finalPrice,
    });
  }, [engaged, typeKey, base, optsKey, rolesKey, red, reductionType, fr, fraisType, finalPrice]);

  const pickType = (key: string) => {
    setTypeKey(key);
    const t = types.find((x) => x.key === key);
    if (t) { setBasePrice(String(t.basePrice)); setManual(null); }
  };
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, name: string) =>
    set((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });

  return (
    <div className="col-span-2 space-y-3 rounded-lg border bg-background/50 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm"><span className={labelCls}>Type d’intérieur</span>
          <select className={inputCls} value={typeKey} onChange={(e) => pickType(e.target.value)}>
            <option value="">Sélectionner…</option>
            {types.map((t) => <option key={t.id} value={t.key}>{t.label} — {fmtMoney(t.basePrice)} $</option>)}
          </select>
        </label>
        <label className="text-sm"><span className={labelCls}>Prix de base ($)</span>
          <input type="number" min="0" step="1" className={inputCls} value={basePrice} onChange={(e) => { setBasePrice(e.target.value); setManual(null); }} placeholder="Calculé selon le type" />
        </label>
      </div>

      {options.length > 0 && (
        <div>
          <span className={labelCls}>Options (majoration)</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {options.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={opts.has(o.name)} onChange={() => { toggle(setOpts, o.name); setManual(null); }} />
                <span>{o.name} <span className="text-emerald-400">(+{o.pct}%)</span></span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm"><span className={labelCls}>Réduction</span>
          <input type="number" min="0" step="1" className={inputCls} value={reduction} onChange={(e) => { setReduction(e.target.value); setManual(null); }} placeholder="0" />
        </label>
        <label className="text-sm"><span className={labelCls}>Type de réduction</span>
          <select className={inputCls} value={reductionType} onChange={(e) => { setReductionType(e.target.value as 'amount'); setManual(null); }}>
            <option value="amount">Montant ($)</option>
            <option value="percent">Pourcentage (%)</option>
          </select>
        </label>
        <label className="text-sm"><span className={labelCls}>Frais supplémentaires</span>
          <input type="number" min="0" step="1" className={inputCls} value={frais} onChange={(e) => { setFrais(e.target.value); setManual(null); }} placeholder="0" />
        </label>
        <label className="text-sm"><span className={labelCls}>Type de frais</span>
          <select className={inputCls} value={fraisType} onChange={(e) => { setFraisType(e.target.value as 'amount'); setManual(null); }}>
            <option value="amount">Montant ($)</option>
            <option value="percent">Pourcentage (%)</option>
          </select>
        </label>
      </div>

      {discounts.length > 0 && (
        <div>
          <span className={labelCls}>Réductions par rôle</span>
          <div className="space-y-1">
            {discounts.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={roles.has(d.name)} onChange={() => { toggle(setRoles, d.name); setManual(null); }} />
                <span>{d.name} <span className="text-destructive">(-{d.pct}%)</span></span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 border-t pt-3">
        <label className="flex-1 text-sm"><span className={labelCls}>Prix final ($)</span>
          <input type="number" min="0" step="1" className={`${inputCls} font-semibold text-emerald-300`} value={manual !== null ? manual : String(computed)} onChange={(e) => setManual(e.target.value)} />
        </label>
        <button type="button" onClick={() => setManual(null)} className="h-9 rounded-md border border-input px-3 text-sm text-muted-foreground hover:bg-accent" title="Recalculer automatiquement">Auto</button>
      </div>
      <p className="text-xs text-muted-foreground">Base {fmtMoney(base)} $ {sumOpt ? `· options +${sumOpt}%` : ''} {sumRole ? `· rôles -${sumRole}%` : ''} {red ? `· réduc -${reductionType === 'percent' ? red + '%' : fmtMoney(red) + ' $'}` : ''} {fr ? `· frais +${fraisType === 'percent' ? fr + '%' : fmtMoney(fr) + ' $'}` : ''} → <span className="font-medium text-foreground">{fmtMoney(finalPrice)} $</span></p>
    </div>
  );
}
