import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ShoppingCart, X, FileDown, Receipt, Loader2 } from 'lucide-react';
import { PAYMENT_METHODS, type PaymentMethod } from '@rp-compta/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { fmtMoney } from '@/lib/declarations';
import { getClients } from '@/lib/clients';
import {
  getSales,
  getSale,
  createSale,
  deleteSale,
  type SaleInput,
} from '@/lib/sales';
import { buildInvoiceSvg, downloadSvgAsPng } from '@/lib/pngDoc';
import type { CatalogItem } from '@/lib/catalog';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

const PAY_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map((p) => [p.key, p.label]));

interface CartLine {
  uid: number;
  catalogItemId: number | null;
  name: string;
  unitPrice: string;
  quantity: string;
  unitCost: number | null;
}

export function SalesView({
  companyId,
  companyName,
  catalogItems,
  canCreate,
  canDelete,
  clientLink,
  discountAllowed,
}: {
  companyId: number;
  companyName: string;
  catalogItems: CatalogItem[];
  canCreate: boolean;
  canDelete: boolean;
  clientLink: boolean;
  discountAllowed: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const uid = useRef(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState<number | ''>('');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');

  const salesQ = useQuery({ queryKey: ['sales', companyId], queryFn: () => getSales(companyId) });
  const clientsQ = useQuery({
    queryKey: ['clients', companyId],
    queryFn: () => getClients(companyId),
    enabled: clientLink,
    retry: false,
  });
  const clients = clientsQ.data?.clients ?? [];

  const invalidateAll = () => {
    for (const k of ['sales', 'stocks', 'clients', 'catalog', 'exercices', 'exercice']) {
      queryClient.invalidateQueries({ queryKey: [k, companyId] });
    }
  };

  const sell = useMutation({
    mutationFn: (body: SaleInput) => createSale(companyId, body),
    onSuccess: (d) => {
      setCart([]);
      setDiscount('');
      setNotes('');
      setClientId('');
      invalidateAll();
      const warns: string[] = [];
      if (d.insufficient.length > 0) warns.push(`Stock négatif sur : ${d.insufficient.join(', ')}.`);
      if (d.creditExceeded) warns.push('Limite de crédit du client dépassée.');
      if (warns.length) toast(`Vente enregistrée. ${warns.join(' ')}`, 'info');
    },
    onError: () => toast("Échec de l'encaissement.", 'error'),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => deleteSale(companyId, id),
    onSuccess: invalidateAll,
    onError: () => toast("Échec de l'annulation.", 'error'),
  });

  const downloadInvoice = async (id: number) => {
    try {
      const s = await getSale(companyId, id);
      const svg = buildInvoiceSvg({
        companyName,
        saleId: s.id,
        date: new Date(s.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }),
        clientName: s.clientName ?? 'Comptant',
        sellerName: s.employeeName ?? '—',
        paymentLabel: PAY_LABEL[s.paymentMethod] ?? s.paymentMethod,
        lines: s.lines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
        subtotal: s.subtotal,
        discount: s.discount,
        total: s.total,
      });
      downloadSvgAsPng(svg, `facture-${s.id}.png`);
    } catch {
      toast('Échec du chargement de la facture.', 'error');
    }
  };

  const addCatalog = (it: CatalogItem) => {
    setCart((c) => {
      const ex = c.find((l) => l.catalogItemId === it.id);
      if (ex) return c.map((l) => (l === ex ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l));
      return [
        ...c,
        {
          uid: uid.current++,
          catalogItemId: it.id,
          name: it.name,
          unitPrice: String(it.price),
          quantity: '1',
          unitCost: it.productionCost,
        },
      ];
    });
  };
  const addFree = () =>
    setCart((c) => [
      ...c,
      { uid: uid.current++, catalogItemId: null, name: '', unitPrice: '', quantity: '1', unitCost: 0 },
    ]);
  const setLine = (u: number, patch: Partial<CartLine>) =>
    setCart((c) => c.map((l) => (l.uid === u ? { ...l, ...patch } : l)));
  const removeLine = (u: number) => setCart((c) => c.filter((l) => l.uid !== u));

  const subtotal = cart.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0), 0);
  const disc = discountAllowed ? Math.min(Number(discount) || 0, subtotal) : 0;
  const total = Math.max(0, subtotal - disc);
  const costKnown = cart.every((l) => l.unitCost !== null);
  const cost = cart.reduce((s, l) => s + (l.unitCost ?? 0) * (Number(l.quantity) || 0), 0);

  const lineValid = (l: CartLine) =>
    Number(l.quantity) > 0 && l.name.trim().length > 0 && (Number(l.unitPrice) || 0) >= 0;
  const canSubmit =
    canCreate &&
    cart.length > 0 &&
    cart.every(lineValid) &&
    !(payment === 'account' && !clientId) &&
    !sell.isPending;

  const submit = () => {
    const body: SaleInput = {
      paymentMethod: payment,
      clientId: clientLink && clientId ? Number(clientId) : null,
      discount: discountAllowed ? Number(discount) || 0 : 0,
      notes: notes.trim() || undefined,
      lines: cart.map((l) =>
        l.catalogItemId
          ? { catalogItemId: l.catalogItemId, quantity: Number(l.quantity) }
          : { name: l.name.trim(), unitPrice: Number(l.unitPrice) || 0, quantity: Number(l.quantity) },
      ),
    };
    sell.mutate(body);
  };

  const activeItems = catalogItems.filter((i) => i.active);
  const recent = salesQ.data?.sales ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Articles</h3>
            {canCreate && (
              <Button type="button" variant="outline" onClick={addFree}>
                <Plus className="h-4 w-4" />
                Ligne libre
              </Button>
            )}
          </div>
          {activeItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Aucun article actif. Ajoute des articles dans Stock › Articles, ou utilise une ligne libre.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activeItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => addCatalog(it)}
                  disabled={!canCreate}
                  className="rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
                >
                  <div className="font-medium">{it.name}</div>
                  <div className="text-xs text-primary">{fmtMoney(it.price)} $</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-4 w-4" /> Panier
          </h3>
          {cart.length === 0 ? (
            <p className="text-xs text-muted-foreground">Panier vide — clique un article ou ajoute une ligne libre.</p>
          ) : (
            <div className="space-y-2">
              {cart.map((l) => (
                <div key={l.uid} className="flex flex-wrap items-center gap-2">
                  {l.catalogItemId ? (
                    <span className="min-w-[8rem] flex-1 text-sm font-medium">{l.name}</span>
                  ) : (
                    <input
                      className={`${inputCls} min-w-[8rem] flex-1`}
                      value={l.name}
                      onChange={(e) => setLine(l.uid, { name: e.target.value })}
                      placeholder="Désignation (service)"
                    />
                  )}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={`${inputCls} w-24`}
                    value={l.unitPrice}
                    onChange={(e) => setLine(l.uid, { unitPrice: e.target.value })}
                    disabled={!!l.catalogItemId}
                    placeholder="prix"
                  />
                  <span className="text-muted-foreground">×</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className={`${inputCls} w-20`}
                    value={l.quantity}
                    onChange={(e) => setLine(l.uid, { quantity: e.target.value })}
                  />
                  <span className="w-20 text-right text-sm font-medium">
                    {fmtMoney((Number(l.unitPrice) || 0) * (Number(l.quantity) || 0))} $
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.uid)}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="space-y-3">
            {clientLink && (
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Client</span>
                <select
                  className={inputCls}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">— aucun —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Paiement</span>
              <select
                className={inputCls}
                value={payment}
                onChange={(e) => setPayment(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {discountAllowed && (
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Remise ($)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputCls}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Notes</span>
              <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>

          <div className="mt-4 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Sous-total</span>
              <span>{fmtMoney(subtotal)} $</span>
            </div>
            {disc > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Remise</span>
                <span>− {fmtMoney(disc)} $</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="text-primary">{fmtMoney(total)} $</span>
            </div>
            {costKnown && cart.length > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Marge estimée</span>
                <span className={total - cost >= 0 ? 'text-emerald-400' : 'text-destructive'}>
                  {fmtMoney(total - cost)} $
                </span>
              </div>
            )}
          </div>

          {payment === 'account' && !clientId && (
            <p className="mt-2 text-[11px] text-amber-400">Le paiement « compte client » nécessite un client.</p>
          )}
          <Button className="mt-3 w-full" onClick={submit} disabled={!canSubmit}>
            {sell.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Encaissement…
              </>
            ) : (
              `Encaisser ${fmtMoney(total)} $`
            )}
          </Button>
        </div>
      </div>

      <div className="lg:col-span-2">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Receipt className="h-4 w-4" /> Ventes récentes
        </h3>
        {salesQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Aucune vente enregistrée."
            hint="Ajoute un article au panier puis encaisse pour voir tes ventes ici."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Client</th>
                  <th className="px-3 py-2 text-left font-semibold">Vendeur</th>
                  <th className="px-3 py-2 text-left font-semibold">Paiement</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                  <th className="px-3 py-2 text-right font-semibold">Marge</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s, i) => (
                  <tr key={s.id} className={i > 0 ? 'border-t' : ''}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-2">{s.clientName ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.employeeName ?? '—'}</td>
                    <td className="px-3 py-2">{PAY_LABEL[s.paymentMethod] ?? s.paymentMethod}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtMoney(s.total)} $</td>
                    <td
                      className={`px-3 py-2 text-right text-xs ${
                        s.margin >= 0 ? 'text-emerald-400' : 'text-destructive'
                      }`}
                    >
                      {fmtMoney(s.margin)} $
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => downloadInvoice(s.id)}
                          title="Facture (PNG)"
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: `Annuler la vente #${s.id} ?`,
                                  message: 'Le stock et le client seront recrédités.',
                                  destructive: true,
                                })
                              )
                                cancel.mutate(s.id);
                            }}
                            title="Annuler"
                            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
