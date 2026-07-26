import { Link } from 'react-router-dom';
import { Users, Wallet, Activity, ArrowRight, Coins, FolderArchive } from 'lucide-react';
import { Kpi } from '@/components/ui/kpi';
import { AssocPage } from '@/components/AssocPage';
import { fmtMoney } from '@/lib/declarations';


export default function AssociationIndex() {
  return (
    <AssocPage title="Tableau de bord">
      {(d) => {
        const slug = d.association.slug;
        return (
          <div className="space-y-6">
            {d.association.objet && (
              <p className="text-sm text-muted-foreground">{d.association.objet}</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi icon={Users} label="Membres" value={String(d.memberCount)} />
              <Kpi
                icon={Wallet}
                label="Solde"
                value={`${fmtMoney(d.balance)} $`}
                accent={d.balance >= 0 ? 'text-primary' : 'text-destructive'}
              />
              <Kpi
                icon={Activity}
                label="Statut"
                value={d.association.status === 'active' ? 'Active' : 'Dissoute'}
                accent={d.association.status === 'active' ? 'text-emerald-400' : 'text-muted-foreground'}
              />
              <Kpi icon={Coins} label="Mouvements récents" value={String(d.recent.length)} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-xl border bg-card p-5 lg:col-span-2">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Coins className="h-4 w-4 text-muted-foreground" /> Derniers mouvements
                </h3>
                {d.recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun mouvement de trésorerie pour l’instant.</p>
                ) : (
                  <ul className="space-y-2">
                    {d.recent.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{t.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t.direction === 'in' ? `de ${t.fromName ?? '—'}` : `vers ${t.toName ?? '—'}`}
                          </span>
                        </span>
                        <span className={`shrink-0 font-medium ${t.amount >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                          {t.amount >= 0 ? '+' : ''}
                          {fmtMoney(t.amount)} $
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to={`/association/${slug}/tresorerie`}
                  className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Voir la trésorerie <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="space-y-3">
                <Link
                  to={`/association/${slug}/membres`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Users className="h-[18px] w-[18px]" />
                  </div>
                  <span className="text-sm font-medium">Membres & bureau</span>
                </Link>
                <Link
                  to={`/association/${slug}/documents`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FolderArchive className="h-[18px] w-[18px]" />
                  </div>
                  <span className="text-sm font-medium">Documents</span>
                </Link>
              </div>
            </div>
          </div>
        );
      }}
    </AssocPage>
  );
}
