import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { computeCorporateTax, type FiscalConfig } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { getFiscalConfig, saveFiscalConfig } from '@/lib/fiscal';

interface BracketDraft {
  min: string;
  max: string;
  rate: string;
}

const inputCls =
  'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

export default function Fiscal() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['fiscal'], queryFn: getFiscalConfig });

  const [dividend, setDividend] = useState('');
  const [brackets, setBrackets] = useState<BracketDraft[]>([]);
  const [example, setExample] = useState('100000');

  useEffect(() => {
    if (!data) return;
    setDividend(String(data.dividendTaxRate));
    setBrackets(
      data.brackets.map((b) => ({
        min: String(b.min),
        max: b.max === null ? '' : String(b.max),
        rate: String(b.rate),
      })),
    );
  }, [data]);

  const toConfig = (): FiscalConfig => ({
    dividendTaxRate: Number(dividend) || 0,
    brackets: brackets.map((b) => ({
      min: Number(b.min) || 0,
      max: b.max.trim() === '' ? null : Number(b.max),
      rate: Number(b.rate) || 0,
    })),
  });

  const save = useMutation({
    mutationFn: () => saveFiscalConfig(toConfig()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal'] }),
  });

  const setBracket = (i: number, field: keyof BracketDraft, value: string) =>
    setBrackets((bs) => bs.map((b, j) => (j === i ? { ...b, [field]: value } : b)));
  const addBracket = () => setBrackets((bs) => [...bs, { min: '', max: '', rate: '' }]);
  const removeBracket = (i: number) => setBrackets((bs) => bs.filter((_, j) => j !== i));

  const exampleTax = computeCorporateTax(Number(example) || 0, toConfig().brackets);
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="max-w-5xl p-8">
      <h1 className="text-2xl font-bold tracking-tight">Barème fiscal</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Config fiscale centrale, appliquée à toutes les entreprises (IRS uniquement).
      </p>

      <div className="mt-6 rounded-xl border bg-card p-5">
        <div className="text-sm font-semibold">Imposition des dividendes</div>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={dividend}
            onChange={(e) => setDividend(e.target.value)}
            className={`${inputCls} w-28`}
          />
          <span className="text-sm text-muted-foreground">% du montant des dividendes</span>
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="text-sm font-semibold">Tranches — impôt sur le bénéfice (société)</div>
          <Button variant="outline" size="sm" onClick={addBracket}>
            <Plus className="h-4 w-4" />
            Tranche
          </Button>
        </div>
        <div className="flex items-center gap-3 border-b px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="flex-1">De ($)</span>
          <span className="flex-1">À ($, vide = ∞)</span>
          <span className="w-28">Taux (%)</span>
          <span className="w-9" />
        </div>
        {brackets.map((b, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0">
            <input
              type="number"
              value={b.min}
              onChange={(e) => setBracket(i, 'min', e.target.value)}
              className={`${inputCls} flex-1`}
            />
            <input
              type="number"
              placeholder="∞"
              value={b.max}
              onChange={(e) => setBracket(i, 'max', e.target.value)}
              className={`${inputCls} flex-1`}
            />
            <input
              type="number"
              value={b.rate}
              onChange={(e) => setBracket(i, 'rate', e.target.value)}
              className={`${inputCls} w-28`}
            />
            <button
              type="button"
              onClick={() => removeBracket(i)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              aria-label="Supprimer la tranche"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {brackets.length === 0 && (
          <div className="px-5 py-4 text-sm text-muted-foreground">Aucune tranche.</div>
        )}
      </div>

      <div className="mt-4 rounded-xl border bg-card p-5">
        <div className="text-sm font-semibold">Simulation</div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Bénéfice</span>
          <input
            type="number"
            value={example}
            onChange={(e) => setExample(e.target.value)}
            className={`${inputCls} w-40`}
          />
          <span className="text-muted-foreground">→ impôt société</span>
          <span className="font-semibold text-primary">{fmt(exampleTax)} $</span>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer le barème'}
        </Button>
      </div>
    </div>
  );
}
