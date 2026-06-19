import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { EffectiveModule } from '@rp-compta/shared';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { getAdminModules, updateModule } from '@/lib/modules';

function ModuleRow({ m }: { m: EffectiveModule }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(m.label);
  const [group, setGroup] = useState(m.group);

  const save = useMutation({
    mutationFn: () => updateModule(m.key, { label: label.trim(), group: group.trim() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-modules'] }),
  });
  const block = useMutation({
    mutationFn: (blocked: boolean) => updateModule(m.key, { blocked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-modules'] }),
  });

  const dirty = label.trim() !== m.label || group.trim() !== m.group;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <code className="w-28 shrink-0 text-xs text-muted-foreground">{m.key}</code>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <input
        value={group}
        onChange={(e) => setGroup(e.target.value)}
        className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex w-32 items-center gap-2">
        <Switch checked={m.blocked} disabled={block.isPending} onChange={() => block.mutate(!m.blocked)} />
        <span className={`text-xs ${m.blocked ? 'text-amber-400' : 'text-muted-foreground'}`}>
          {m.blocked ? 'Bloqué' : 'Actif'}
        </span>
      </div>
      <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
        Enregistrer
      </Button>
    </div>
  );
}

export default function Modules() {
  const mods = useQuery({ queryKey: ['admin-modules'], queryFn: getAdminModules });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Modules</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Renomme, recatégorise ou bloque un module pour tout le serveur (maintenance / panne).
      </p>

      <div className="mt-6 rounded-xl border bg-card">
        <div className="flex items-center gap-3 border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="w-28 shrink-0">Clé</span>
          <span className="flex-1">Libellé</span>
          <span className="w-44">Catégorie</span>
          <span className="w-32">État</span>
          <span className="w-[88px]" />
        </div>
        {mods.isLoading && <div className="p-4 text-sm text-muted-foreground">Chargement…</div>}
        {mods.data?.map((m) => <ModuleRow key={m.key} m={m} />)}
      </div>
    </div>
  );
}
