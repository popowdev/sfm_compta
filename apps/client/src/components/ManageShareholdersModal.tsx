import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { fmtMoney } from '@/lib/declarations';
import {
  getMyShareholders,
  createMyShareholder,
  updateMyShareholder,
  deleteMyShareholder,
  updateMyValuation,
  type PublicShareholder,
} from '@/lib/shareholders';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

export function ManageShareholdersModal({
  companyId,
  open,
  onClose,
}: {
  companyId: number;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['shareholders', companyId], queryFn: () => getMyShareholders(companyId), enabled: open });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shareholders', companyId] });

  const [valuation, setValuation] = useState('');
  const [add, setAdd] = useState({ name: '', percentage: '', shareType: 'ordinaire', anonymous: false, publicName: '' });

  const data = q.data;
  const list = data?.shareholders ?? [];
  const total = list.reduce((s, h) => s + h.percentage, 0);
  const valNum = valuation === '' ? (data?.valuation ?? 0) : Number(valuation);

  const saveVal = useMutation({
    mutationFn: () => updateMyValuation(companyId, Number(valuation) || 0),
    onSuccess: () => {
      setValuation('');
      invalidate();
      toast('Valorisation enregistrée.', 'success');
    },
    onError: () => toast('Échec.', 'error'),
  });
  const create = useMutation({
    mutationFn: () =>
      createMyShareholder(companyId, {
        name: add.name.trim(),
        percentage: Number(add.percentage) || 0,
        shareType: add.shareType.trim() || 'ordinaire',
        anonymous: add.anonymous,
        publicName: add.publicName.trim() || null,
      }),
    onSuccess: () => {
      setAdd({ name: '', percentage: '', shareType: 'ordinaire', anonymous: false, publicName: '' });
      invalidate();
    },
    onError: () => toast('Échec de l’ajout.', 'error'),
  });
  const remove = useMutation({
    mutationFn: (sid: number) => deleteMyShareholder(companyId, sid),
    onSuccess: invalidate,
    onError: () => toast('Échec de la suppression.', 'error'),
  });

  if (!open) return null;
  const addValid = add.name.trim().length > 0 && add.percentage !== '' && Number(add.percentage) >= 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Gérer les actionnaires</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valorisation</div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Valeur totale de l'entreprise ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`${inputCls} w-56`}
                  value={valuation === '' ? String(data?.valuation ?? '') : valuation}
                  onChange={(e) => setValuation(e.target.value)}
                />
              </label>
              <div className="text-sm text-muted-foreground">
                Valeur d'une part <span className="font-semibold text-emerald-400">{fmtMoney(valNum / 100)} $</span> <span className="text-xs">(100 parts)</span>
              </div>
              <Button className="ml-auto" onClick={() => saveVal.mutate()} disabled={valuation === '' || saveVal.isPending}>
                {saveVal.isPending ? '…' : 'Enregistrer'}
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actionnaires</div>
              <span className={`text-xs font-medium ${total > 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
                Total : {total.toLocaleString('fr-FR')} %
              </span>
            </div>
            <div className="space-y-2">
              {list.map((h) => (
                <ShareholderRow key={h.id} companyId={companyId} sh={h} onSaved={invalidate} onDelete={async () => {
                  if (await confirm({ title: 'Supprimer cet actionnaire ?', message: h.name, destructive: true })) remove.mutate(h.id);
                }} />
              ))}
              {list.length === 0 && <p className="text-sm text-muted-foreground">Aucun actionnaire. Ajoute le premier ci-dessous.</p>}
            </div>

            <div className="mt-4 rounded-lg border border-dashed p-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">Nouvel actionnaire</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Nom</span>
                  <input className={`${inputCls} w-44`} value={add.name} onChange={(e) => setAdd((a) => ({ ...a, name: e.target.value }))} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Parts (%)</span>
                  <input type="number" step="0.01" min="0" max="100" className={`${inputCls} w-24`} value={add.percentage} onChange={(e) => setAdd((a) => ({ ...a, percentage: e.target.value }))} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Type</span>
                  <input className={`${inputCls} w-28`} value={add.shareType} onChange={(e) => setAdd((a) => ({ ...a, shareType: e.target.value }))} />
                </label>
                <label className="flex items-center gap-1.5 pb-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={add.anonymous} onChange={(e) => setAdd((a) => ({ ...a, anonymous: e.target.checked }))} />
                  <span>Anonyme</span>
                </label>
                {add.anonymous && (
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Nom public</span>
                    <input className={`${inputCls} w-36`} value={add.publicName} onChange={(e) => setAdd((a) => ({ ...a, publicName: e.target.value }))} />
                  </label>
                )}
                <Button onClick={() => create.mutate()} disabled={!addValid || create.isPending}>
                  <Plus className="h-4 w-4" />
                  Ajouter
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareholderRow({
  companyId,
  sh,
  onSaved,
  onDelete,
}: {
  companyId: number;
  sh: PublicShareholder;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(sh.name);
  const [pct, setPct] = useState(String(sh.percentage));
  const [shareType, setShareType] = useState(sh.shareType);
  const [anonymous, setAnonymous] = useState(!!sh.anonymous);
  const [publicName, setPublicName] = useState(sh.publicName ?? '');

  const save = useMutation({
    mutationFn: () =>
      updateMyShareholder(companyId, sh.id, {
        name: name.trim(),
        percentage: Number(pct) || 0,
        shareType: shareType.trim() || 'ordinaire',
        anonymous,
        publicName: publicName.trim() || null,
      }),
    onSuccess: onSaved,
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });
  const dirty =
    name !== sh.name ||
    pct !== String(sh.percentage) ||
    shareType !== sh.shareType ||
    anonymous !== !!sh.anonymous ||
    publicName !== (sh.publicName ?? '');

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border px-3 py-2">
      <input className={`${inputCls} w-40`} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom" />
      <input type="number" step="0.01" min="0" max="100" className={`${inputCls} w-24`} value={pct} onChange={(e) => setPct(e.target.value)} aria-label="Parts %" />
      <input className={`${inputCls} w-28`} value={shareType} onChange={(e) => setShareType(e.target.value)} aria-label="Type" />
      <label className="flex items-center gap-1.5 pb-2 text-sm">
        <input type="checkbox" className="h-4 w-4 rounded border-input accent-primary" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span className="text-xs">Anonyme</span>
      </label>
      {anonymous && (
        <input className={`${inputCls} w-32`} value={publicName} onChange={(e) => setPublicName(e.target.value)} placeholder="Nom public" aria-label="Nom public" />
      )}
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!dirty || save.isPending}
        title="Enregistrer"
        className="grid h-9 w-9 place-items-center rounded-md border text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Supprimer"
        className="grid h-9 w-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
