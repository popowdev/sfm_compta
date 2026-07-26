import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, TrendingUp, Check, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useAuth } from '@/auth/AuthContext';
import { fmtMoney } from '@/lib/declarations';
import { getMyCompanies } from '@/lib/me';
import { getMyShareholders } from '@/lib/shareholders';
import {
  getShareListings,
  createListing,
  deleteListing,
  requestPurchase,
  acceptRequest,
  refuseRequest,
  type ShareListing,
} from '@/lib/shareListings';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

export default function Bourse() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['share-listings'], queryFn: getShareListings });
  const list = q.data?.listings ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [requestFor, setRequestFor] = useState<ShareListing | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['share-listings'] });

  const removeListing = useMutation({
    mutationFn: (id: number) => deleteListing(id),
    onSuccess: invalidate,
    onError: () => toast('Échec.', 'error'),
  });
  const accept = useMutation({
    mutationFn: (rid: number) => acceptRequest(rid),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['shareholders'] });
      toast('Transfert validé.', 'success');
    },
    onError: () => toast('Échec du transfert.', 'error'),
  });
  const refuse = useMutation({
    mutationFn: (rid: number) => refuseRequest(rid),
    onSuccess: invalidate,
    onError: () => toast('Échec.', 'error'),
  });

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bourse de parts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Parts d’entreprises en vente. Faire une demande, le vendeur valide le transfert (règlement IG).
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Mettre des parts en vente
        </Button>
      </div>

      <div className="mt-6">
        {q.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Aucune part en vente" hint="Les parts mises en vente apparaîtront ici." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((l) => (
              <div key={l.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{l.companyName}</div>
                    <div className="text-xs text-muted-foreground">
                      Vendeur : {l.sellerName ?? '—'}
                      {l.note ? ` · ${l.note}` : ''}
                    </div>
                  </div>
                  {l.mine && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirm({ title: 'Retirer cette vente ?', message: l.companyName, destructive: true })) removeListing.mutate(l.id);
                      }}
                      title="Retirer"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted-foreground">Parts dispo </span>
                    <span className="font-semibold">{l.parts.toLocaleString('fr-FR')} %</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Prix/part </span>
                    <span className="font-semibold text-primary">{fmtMoney(l.pricePerPart)} $</span>
                  </span>
                </div>

                {l.mine ? (
                  <div className="mt-3 border-t pt-3">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Demandes ({l.pendingCount})
                    </div>
                    {l.requests.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucune demande.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {l.requests.map((r) => (
                          <div key={r.id} className="flex items-center gap-2 text-sm">
                            <span className="min-w-0 flex-1 truncate">
                              {r.buyerName} — {r.parts.toLocaleString('fr-FR')} %
                            </span>
                            {r.status === 'pending' ? (
                              <>
                                <button type="button" onClick={() => accept.mutate(r.id)} disabled={accept.isPending} title="Valider le transfert" className="grid h-7 w-7 place-items-center rounded-md border text-emerald-400 hover:bg-emerald-500/10">
                                  <Check className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => refuse.mutate(r.id)} disabled={refuse.isPending} title="Refuser" className="grid h-7 w-7 place-items-center rounded-md border text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                  <Ban className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${r.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                                {r.status === 'accepted' ? 'validée' : 'refusée'}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3">
                    {l.myRequest ? (
                      <span className="text-xs font-medium text-amber-400">Ta demande est en attente.</span>
                    ) : (
                      <Button variant="outline" onClick={() => setRequestFor(l)}>
                        Faire une demande
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {createOpen && <CreateListingModal onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); invalidate(); }} />}
      {requestFor && <RequestModal listing={requestFor} onClose={() => setRequestFor(null)} onDone={() => { setRequestFor(null); invalidate(); }} />}
    </div>
  );
}

function CreateListingModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const companies = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });
  const manageable = (companies.data ?? []).filter((c) => c.canManage);
  const [companyId, setCompanyId] = useState<number | ''>('');
  const sh = useQuery({
    queryKey: ['shareholders', companyId],
    queryFn: () => getMyShareholders(companyId as number),
    enabled: typeof companyId === 'number',
  });
  const [sellerId, setSellerId] = useState<number | ''>('');
  const [parts, setParts] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createListing({
        companyId: companyId as number,
        sellerShareholderId: sellerId as number,
        parts: Number(parts) || 0,
        pricePerPart: Number(price) || 0,
        note: note.trim() || undefined,
      }),
    onSuccess: onDone,
    onError: () => toast('Échec (parts insuffisantes ?).', 'error'),
  });

  const seller = (sh.data?.shareholders ?? []).find((s) => s.id === sellerId);
  const valid =
    typeof companyId === 'number' &&
    typeof sellerId === 'number' &&
    Number(parts) > 0 &&
    !!seller &&
    Number(parts) <= seller.percentage;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Mettre des parts en vente</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {manageable.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">Tu ne gères aucune entreprise.</div>
        ) : (
          <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !create.isPending) create.mutate(); }}>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Entreprise</span>
              <select className={inputCls} value={companyId} onChange={(e) => { setCompanyId(e.target.value ? Number(e.target.value) : ''); setSellerId(''); }}>
                <option value="">— choisir —</option>
                {manageable.map((c) => (
                  <option key={c.company.id} value={c.company.id}>{c.company.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Actionnaire vendeur</span>
              <select className={inputCls} value={sellerId} onChange={(e) => setSellerId(e.target.value ? Number(e.target.value) : '')} disabled={typeof companyId !== 'number'}>
                <option value="">— choisir —</option>
                {(sh.data?.shareholders ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.percentage.toLocaleString('fr-FR')} %)</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Parts à vendre (%)</span>
                <input type="number" step="0.01" min="0" max={seller?.percentage ?? 100} className={inputCls} value={parts} onChange={(e) => setParts(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Prix / part ($)</span>
                <input type="number" step="0.01" min="0" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Note (optionnel)</span>
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {seller && Number(parts) > seller.percentage && (
              <p className="text-xs text-destructive">Le vendeur ne détient que {seller.percentage.toLocaleString('fr-FR')} %.</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
              <Button type="submit" disabled={!valid || create.isPending}>{create.isPending ? 'Publication…' : 'Mettre en vente'}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function RequestModal({ listing, onClose, onDone }: { listing: ShareListing; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [parts, setParts] = useState('');
  const [buyerName, setBuyerName] = useState(user?.displayName ?? '');

  const send = useMutation({
    mutationFn: () => requestPurchase(listing.id, { parts: Number(parts) || 0, buyerName: buyerName.trim() }),
    onSuccess: onDone,
    onError: () => toast('Échec de la demande.', 'error'),
  });
  const valid = Number(parts) > 0 && Number(parts) <= listing.parts && buyerName.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Demande d’achat — {listing.companyName}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !send.isPending) send.mutate(); }}>
          <p className="text-xs text-muted-foreground">
            {listing.parts.toLocaleString('fr-FR')} % dispo à {fmtMoney(listing.pricePerPart)} $/part.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Ton nom (acheteur)</span>
            <input className={inputCls} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Parts souhaitées (%)</span>
            <input type="number" step="0.01" min="0" max={listing.parts} className={inputCls} value={parts} onChange={(e) => setParts(e.target.value)} autoFocus />
          </label>
          {Number(parts) > 0 && (
            <div className="rounded-lg border bg-background/40 p-2 text-xs text-muted-foreground">
              Coût indicatif <span className="font-semibold text-foreground">{fmtMoney((Number(parts) || 0) * listing.pricePerPart)} $</span> (réglé IG)
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!valid || send.isPending}>{send.isPending ? 'Envoi…' : 'Envoyer la demande'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
