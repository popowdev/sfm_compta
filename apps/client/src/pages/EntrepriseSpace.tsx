import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMyCompanies, type MyModule } from '@/lib/me';

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export default function EntrepriseSpace() {
  const { id } = useParams();
  const companyId = Number(id);
  const { data, isLoading } = useQuery({ queryKey: ['my-companies'], queryFn: getMyCompanies });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  }

  const mine = data?.find((c) => c.company.id === companyId);
  if (!mine) return <Navigate to="/" replace />;

  const accessible = mine.modules.filter((m) => m.enabled && !m.blocked && m.canView);
  const groups: { group: string; items: MyModule[] }[] = [];
  for (const m of accessible) {
    let g = groups.find((x) => x.group === m.group);
    if (!g) {
      g = { group: m.group, items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background text-sm font-semibold text-primary">
          {mine.company.logoUrl ? (
            <img src={mine.company.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(mine.company.name)
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{mine.company.name}</h1>
          {mine.grade && <p className="text-sm text-primary">{mine.grade.name}</p>}
        </div>
      </div>

      {accessible.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun module accessible pour ton grade.
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.group}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((m) => (
                  <div key={m.key} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{m.label}</div>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          m.canWrite ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {m.canWrite ? 'Écriture' : 'Lecture'}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">Bientôt disponible</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Les pages des modules arrivent prochainement. Ton accès dépend des permissions de ton grade.
      </p>
    </div>
  );
}
