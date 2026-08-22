import { useState } from 'react';
import { useModulePerms } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, FileText, Clock, Coins, ImageIcon, Paperclip } from 'lucide-react';
import { SUBVENTION_TYPES, type SubventionType } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Kpi, KpiSkeleton } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { fmtMoney } from '@/lib/declarations';
import {
  getMySubventions,
  requestSubvention,
  type SubventionStatus,
  type SubventionRequestInput,
} from '@/lib/subventions';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

export const SUB_STATUS: Record<SubventionStatus, { label: string; cls: string }> = {
  pending: { label: 'en attente', cls: 'bg-amber-500/10 text-amber-400' },
  approved: { label: 'accordée', cls: 'bg-primary/10 text-primary' },
  rejected: { label: 'refusée', cls: 'bg-destructive/10 text-destructive' },
  paid: { label: 'versée', cls: 'bg-emerald-500/10 text-emerald-400' },
};

export const fmtDepot = (v: string) => new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const SUB_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  SUBVENTION_TYPES.map((t) => [t.key, t.label]),
);

const EMPTY = { motif: '', type: 'evenement' as SubventionType, requesterName: '', rib: '', amountRequested: '', notes: '' };
const MAX_DOCS = 10;

export default function Subventions() {
  const { companyId, canCreate } = useModulePerms('subventions');
  const queryClient = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['subventions', companyId],
    queryFn: () => getMySubventions(companyId),
  });

  const [form, setForm] = useState({ ...EMPTY });
  const [photo, setPhoto] = useState<File | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [open, setOpen] = useState(false);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setForm({ ...EMPTY });
    setPhoto(null);
    setDocs([]);
  };
  const close = () => {
    setOpen(false);
    reset();
  };
  const openNew = () => {
    reset();
    setOpen(true);
  };

  const request = useMutation({
    mutationFn: (body: SubventionRequestInput) => requestSubvention(companyId, body),
    onSuccess: () => {
      close();
      queryClient.invalidateQueries({ queryKey: ['subventions', companyId] });
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : null;
      toast(
        code === 'photo_required'
          ? 'La photo de l’événement est obligatoire.'
          : code === 'file_too_large'
            ? 'Fichier trop volumineux (8 Mo maximum par fichier).'
            : code === 'too_many_files'
              ? 'Trop de fichiers (10 documents maximum).'
              : 'Échec de l’envoi de la demande.',
        'error',
      );
    },
  });

  const list = q.data?.subventions ?? [];
  const granted = list
    .filter((s) => s.status === 'approved' || s.status === 'paid')
    .reduce((sum, s) => sum + (s.amountGranted ?? 0), 0);
  const pending = list.filter((s) => s.status === 'pending').length;
  const valid = form.motif.trim().length > 0 && form.requesterName.trim().length > 0 && form.rib.trim().length > 0 && !!photo;

  const submit = () => {
    if (!valid || !photo) return;
    request.mutate({
      motif: form.motif.trim(),
      type: form.type,
      requesterName: form.requesterName.trim(),
      rib: form.rib.trim(),
      amountRequested: Number(form.amountRequested) || 0,
      notes: form.notes.trim() || undefined,
      photo,
      documents: docs,
    });
  };

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi icon={FileText} label="Demandes" value={String(list.length)} />
          <Kpi icon={Clock} label="En attente" value={String(pending)} accent="text-amber-400" />
          <Kpi icon={Coins} label="Total accordé" value={`${fmtMoney(granted)} $`} accent="text-primary" />
        </div>
        {canCreate && (
          <Button className="ml-auto" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nouvelle demande
          </Button>
        )}
      </div>

      {q.isError ? (
        <div className="grid place-items-center gap-3 rounded-xl border bg-card py-12 text-sm text-muted-foreground">
          <span>Impossible de charger les demandes de subvention.</span>
          <Button variant="outline" onClick={() => q.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucune demande de subvention"
          hint="Les demandes envoyées apparaîtront ici."
          action={
            canCreate ? (
              <Button variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Faire une demande
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Motif</th>
                  <th className="px-4 py-3 text-left font-semibold">Déposée le</th>
                  <th className="px-4 py-3 text-left font-semibold">Demandeur</th>
                  <th className="px-4 py-3 text-right font-semibold">Demandé</th>
                  <th className="px-4 py-3 text-right font-semibold">Accordé</th>
                  <th className="px-4 py-3 text-left font-semibold">Pièces</th>
                  <th className="px-4 py-3 text-left font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.motif}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {SUB_TYPE_LABEL[s.type] ?? s.type}
                        </span>
                      </div>
                      {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDepot(s.createdAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.requesterName}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(s.amountRequested)} $</td>
                    <td className="px-4 py-3 text-right">
                      {s.amountGranted === null ? '—' : `${fmtMoney(s.amountGranted)} $`}
                    </td>
                    <td className="px-4 py-3">
                      <Attachments photoUrl={s.photoUrl} documents={s.documents} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${SUB_STATUS[s.status].cls}`}>
                        {SUB_STATUS[s.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Nouvelle demande de subvention</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="p-5"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Motif</span>
                  <input
                    className={inputCls}
                    placeholder="ex. tournoi de boxe"
                    value={form.motif}
                    onChange={(e) => set('motif', e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Type</span>
                  <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value as SubventionType)}>
                    {SUBVENTION_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Demandeur (nom/prénom)</span>
                  <input
                    className={inputCls}
                    value={form.requesterName}
                    onChange={(e) => set('requesterName', e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">RIB (obligatoire)</span>
                  <input
                    className={inputCls}
                    value={form.rib}
                    onChange={(e) => set('rib', e.target.value)}
                    placeholder="RIB / IBAN où verser la subvention"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">Montant demandé ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    className={inputCls}
                    value={form.amountRequested}
                    onChange={(e) => set('amountRequested', e.target.value)}
                  />
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">
                    Photo de l’événement <span className="text-destructive">*</span>
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {photo ? `Sélectionné : ${photo.name}` : 'Obligatoire — image (jpg, png, webp…).'}
                  </span>
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">Documents (optionnel)</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(e) => setDocs(Array.from(e.target.files ?? []).slice(0, MAX_DOCS))}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {docs.length > 0
                      ? `${docs.length} fichier(s) — ${docs.map((d) => d.name).join(', ')}`
                      : `Images ou PDF, jusqu’à ${MAX_DOCS}.`}
                  </span>
                </label>

                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">Détails / justificatif</span>
                  <textarea
                    className={`${inputCls} h-20 py-2`}
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!valid || request.isPending}>
                  {request.isPending ? 'Envoi…' : 'Envoyer la demande'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function Attachments({
  photoUrl,
  documents,
}: {
  photoUrl: string | null;
  documents: { id: number; url: string; name: string }[];
}) {
  if (!photoUrl && documents.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {photoUrl && (
        <a
          href={photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ImageIcon className="h-3.5 w-3.5" /> Photo
        </a>
      )}
      {documents.map((d, i) => (
        <a
          key={d.id}
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          title={d.name}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Paperclip className="h-3.5 w-3.5" /> Doc {i + 1}
        </a>
      ))}
    </div>
  );
}
