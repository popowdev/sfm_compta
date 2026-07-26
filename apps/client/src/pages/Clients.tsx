import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, Phone, Mail, Search, Wallet, Users, Coins } from 'lucide-react';
import { LOYALTY_TIERS, moduleConfigBool, type LoyaltyTier } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { Kpi, KpiSkeleton } from '@/components/ui/kpi';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm';
import { fmtMoney } from '@/lib/declarations';
import { useModulePerms } from '@/lib/useCompany';
import {
  getClients,
  createClient,
  updateClient,
  deleteClient,
  getLoyaltyTiers,
  adjustClientBalance,
  TIER_CLS,
  type Client,
  type ClientInput,
} from '@/lib/clients';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-muted-foreground';

const TIER_LABEL: Record<string, string> = Object.fromEntries(LOYALTY_TIERS.map((t) => [t.key, t.label]));

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  notes: '',
  loyaltyTier: 'bronze' as LoyaltyTier,
  loyaltyPoints: '0',
  totalSpent: '0',
  accountBalance: '0',
  creditLimit: '0',
};

export default function Clients() {
  const { company, companyId, canCreate, canEdit, canDelete, special } = useModulePerms('clients');
  const cfg = company?.modules.find((m) => m.key === 'clients')?.config;
  const showLoyalty = moduleConfigBool(cfg, 'clients', 'loyalty');
  const showCredit = moduleConfigBool(cfg, 'clients', 'credit');
  const canAdjustBalance = special.adjust_balance ?? false;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const q = useQuery({ queryKey: ['clients', companyId], queryFn: () => getClients(companyId) });
  const tiersQ = useQuery({
    queryKey: ['loyalty-tiers', companyId],
    queryFn: () => getLoyaltyTiers(companyId),
    enabled: showLoyalty,
  });
  const tierName = (t: LoyaltyTier) =>
    tiersQ.data?.tiers.find((x) => x.tier === t)?.name ?? TIER_LABEL[t] ?? t;

  const [balanceClient, setBalanceClient] = useState<Client | null>(null);
  const [delta, setDelta] = useState('');
  const adjust = useMutation({
    mutationFn: (v: { id: number; delta: number }) => adjustClientBalance(companyId, v.id, v.delta),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', companyId] });
      setBalanceClient(null);
      setDelta('');
    },
  });

  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const close = () => {
    setOpen(false);
    setEditing(null);
    setForm({ ...EMPTY });
  };
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['clients', companyId] });
    close();
  };

  const create = useMutation({ mutationFn: (b: ClientInput) => createClient(companyId, b), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (v: { id: number; body: ClientInput }) => updateClient(companyId, v.id, v.body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (cid: number) => deleteClient(companyId, cid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients', companyId] }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c.id);
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      notes: c.notes ?? '',
      loyaltyTier: c.loyaltyTier,
      loyaltyPoints: String(c.loyaltyPoints),
      totalSpent: String(c.totalSpent),
      accountBalance: String(c.accountBalance),
      creditLimit: String(c.creditLimit),
    });
    setOpen(true);
  };

  const submit = () => {
    const keep = editing !== null;
    const body: ClientInput = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      notes: form.notes.trim() || undefined,
      loyaltyTier: showLoyalty || keep ? form.loyaltyTier : undefined,
      loyaltyPoints: showLoyalty || keep ? Number(form.loyaltyPoints) || 0 : undefined,
      totalSpent: showLoyalty || keep ? Number(form.totalSpent) || 0 : undefined,
      accountBalance: showCredit || keep ? Number(form.accountBalance) || 0 : undefined,
      creditLimit: showCredit || keep ? Number(form.creditLimit) || 0 : undefined,
    };
    if (editing !== null) update.mutate({ id: editing, body });
    else create.mutate(body);
  };

  const all = q.data?.clients ?? [];
  const term = search.trim().toLowerCase();
  const list = term
    ? all.filter((c) =>
        [c.name, c.phone ?? '', c.email ?? ''].some((s) => s.toLowerCase().includes(term)),
      )
    : all;
  const totalSpent = all.reduce((s, c) => s + c.totalSpent, 0);
  const balances = all.reduce((s, c) => s + c.accountBalance, 0);
  const pending = create.isPending || update.isPending;

  if (q.isLoading) {
    const kpiCount = 1 + (showLoyalty ? 1 : 0) + (showCredit ? 1 : 0);
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: kpiCount }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-9 rounded-md" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi icon={Users} label="Clients" value={String(all.length)} accent="text-sky-400" />
          {showLoyalty && (
            <Kpi icon={Wallet} label="Total dépensé" value={`${fmtMoney(totalSpent)} $`} accent="text-primary" />
          )}
          {showCredit && (
            <Kpi icon={Coins} label="Soldes crédit" value={`${fmtMoney(balances)} $`} accent="text-emerald-400" />
          )}
        </div>
        {canCreate && (
          <Button className="ml-auto" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nouveau client
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, téléphone, email…"
          aria-label="Rechercher un client"
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-3">
        {list.map((c) => (
          <div key={c.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{c.name}</span>
                  {showLoyalty && (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${TIER_CLS[c.loyaltyTier]}`}>
                      {tierName(c.loyaltyTier)}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {c.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {c.phone}
                    </span>
                  )}
                  {c.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {c.email}
                    </span>
                  )}
                </div>
              </div>
              {(canEdit || canDelete || (showCredit && canAdjustBalance)) && (
                <div className="flex shrink-0 gap-1">
                  {showCredit && canAdjustBalance && (
                    <button
                      type="button"
                      onClick={() => {
                        setBalanceClient(c);
                        setDelta('');
                      }}
                      title="Ajuster le solde"
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Wallet className="h-4 w-4" />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      title="Modifier"
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: 'Supprimer ?',
                            message: `Supprimer ${c.name} ?`,
                            destructive: true,
                          })
                        )
                          remove.mutate(c.id);
                      }}
                      title="Supprimer"
                      className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
            {(showLoyalty || showCredit) && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
                {showLoyalty && (
                  <>
                    <Field label="Points" value={`${c.loyaltyPoints}`} />
                    <Field label="Total dépensé" value={`${fmtMoney(c.totalSpent)} $`} />
                  </>
                )}
                {showCredit && (
                  <>
                    <Field label="Solde compte" value={`${fmtMoney(c.accountBalance)} $`} />
                    <Field label="Limite crédit" value={`${fmtMoney(c.creditLimit)} $`} />
                  </>
                )}
              </div>
            )}
            {c.notes && <div className="mt-3 text-sm text-muted-foreground">{c.notes}</div>}
          </div>
        ))}
        {list.length === 0 && (
          <EmptyState
            icon={Users}
            title={all.length === 0 ? 'Aucun client enregistré.' : 'Aucun client trouvé.'}
            hint={all.length === 0 ? undefined : 'Essayez un autre terme de recherche.'}
            action={
              canCreate && all.length === 0 ? (
                <Button variant="outline" onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Ajouter le premier client
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-sm font-semibold">
                {editing !== null ? 'Modifier le client' : 'Nouveau client'}
              </h2>
              <button
                type="button"
                onClick={close}
                title="Fermer"
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
                if (form.name.trim()) submit();
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Nom</span>
                  <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Téléphone</span>
                  <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className={labelCls}>Email</span>
                  <input className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} />
                </label>
                {showLoyalty && (
                  <>
                    <label className="text-sm">
                      <span className={labelCls}>Palier fidélité</span>
                      <select className={inputCls} value={form.loyaltyTier} onChange={(e) => set('loyaltyTier', e.target.value as LoyaltyTier)}>
                        {LOYALTY_TIERS.map((t) => (
                          <option key={t.key} value={t.key}>
                            {tierName(t.key)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className={labelCls}>Points</span>
                      <input type="number" min="0" className={inputCls} value={form.loyaltyPoints} onChange={(e) => set('loyaltyPoints', e.target.value)} />
                    </label>
                    <label className="text-sm">
                      <span className={labelCls}>Total dépensé ($)</span>
                      <input type="number" min="0" step="0.01" className={inputCls} value={form.totalSpent} onChange={(e) => set('totalSpent', e.target.value)} />
                    </label>
                  </>
                )}
                {showCredit && (
                  <>
                    <label className="text-sm">
                      <span className={labelCls}>Solde compte ($)</span>
                      <input type="number" step="0.01" className={inputCls} value={form.accountBalance} onChange={(e) => set('accountBalance', e.target.value)} />
                    </label>
                    <label className="text-sm">
                      <span className={labelCls}>Limite crédit ($)</span>
                      <input type="number" min="0" step="0.01" className={inputCls} value={form.creditLimit} onChange={(e) => set('creditLimit', e.target.value)} />
                    </label>
                  </>
                )}
                <label className="text-sm sm:col-span-2">
                  <span className={labelCls}>Notes</span>
                  <textarea className={`${inputCls} h-16 py-2`} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!form.name.trim() || pending}>
                  {pending ? 'Enregistrement…' : editing !== null ? 'Enregistrer' : 'Ajouter'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {balanceClient && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="truncate text-sm font-semibold">Ajuster le solde · {balanceClient.name}</h2>
              <button
                type="button"
                onClick={() => setBalanceClient(null)}
                title="Fermer"
                aria-label="Fermer"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                const d = Number(delta);
                if (d) adjust.mutate({ id: balanceClient.id, delta: d });
              }}
            >
              <div className="text-sm text-muted-foreground">
                Solde actuel :{' '}
                <span className="font-medium text-foreground">{fmtMoney(balanceClient.accountBalance)} $</span>
              </div>
              <label className="block text-sm">
                <span className={labelCls}>Ajustement (+ crédit / − débit)</span>
                <input
                  type="number"
                  step="0.01"
                  autoFocus
                  className={inputCls}
                  placeholder="ex. 50 ou -50"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                />
              </label>
              {Number(delta) !== 0 && delta.trim() !== '' && (
                <div className="text-sm">
                  Nouveau solde :{' '}
                  <span className="font-semibold">
                    {fmtMoney(balanceClient.accountBalance + Math.round((Number(delta) || 0) * 100) / 100)} $
                  </span>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setBalanceClient(null)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!Number(delta) || adjust.isPending}>
                  {adjust.isPending ? 'Application…' : 'Appliquer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
