import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { LOYALTY_TIERS } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { getLoyaltyTiers, saveLoyaltyTiers, type LoyaltyTierDef } from '@/lib/clients';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

export function LoyaltyTiersModal({
  companyId,
  open,
  onClose,
}: {
  companyId: number;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['loyalty-tiers', companyId],
    queryFn: () => getLoyaltyTiers(companyId),
    enabled: open,
  });
  const [rows, setRows] = useState<Record<string, { name: string; threshold: string }>>({});
  const seeded = useRef(false);

  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (q.data && !seeded.current) {
      seeded.current = true;
      const next: Record<string, { name: string; threshold: string }> = {};
      for (const t of q.data.tiers) next[t.tier] = { name: t.name, threshold: String(t.threshold) };
      setRows(next);
    }
  }, [open, q.data]);

  const save = useMutation({
    mutationFn: () => {
      const tiers: LoyaltyTierDef[] = LOYALTY_TIERS.map((t) => ({
        tier: t.key,
        name: (rows[t.key]?.name || t.label).trim(),
        threshold: Number(rows[t.key]?.threshold) || 0,
      }));
      return saveLoyaltyTiers(companyId, tiers);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-tiers', companyId] });
      queryClient.invalidateQueries({ queryKey: ['my-companies'] });
      onClose();
    },
  });

  if (!open) return null;
  const canManage = q.data?.canManage ?? false;
  const set = (tier: string, k: 'name' | 'threshold', v: string) =>
    setRows((r) => ({ ...r, [tier]: { ...{ name: '', threshold: '' }, ...r[tier], [k]: v } }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Paliers de fidélité</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <p className="mb-4 text-xs text-muted-foreground">
            Renomme tes paliers et fixe le seuil de points pour chacun.
          </p>
          <div className="space-y-2">
            {LOYALTY_TIERS.map((t) => (
              <div key={t.key} className="grid grid-cols-[1fr_120px] items-center gap-2">
                <input
                  disabled={!canManage}
                  className={inputCls}
                  placeholder={t.label}
                  value={rows[t.key]?.name ?? ''}
                  onChange={(e) => set(t.key, 'name', e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  disabled={!canManage}
                  className={inputCls}
                  placeholder="seuil pts"
                  value={rows[t.key]?.threshold ?? ''}
                  onChange={(e) => set(t.key, 'threshold', e.target.value)}
                />
              </div>
            ))}
          </div>
          {canManage && (
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Fermer
              </Button>
              <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
