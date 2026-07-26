import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRound, Check, Loader2, Briefcase } from 'lucide-react';
import { getMyFivemCharacters, selectMyFivemCharacter } from '@/lib/fivem';
import { useToast } from '@/components/ui/toast';

export function FivemCharacterCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['my-fivem-characters'], queryFn: getMyFivemCharacters });

  const select = useMutation({
    mutationFn: (name: string) => selectMyFivemCharacter(name),
    onSuccess: (r) => {
      toast(r.job ? `Personnage actif — accès ${r.job}.` : 'Personnage actif (aucun job).', 'success');
      queryClient.invalidateQueries({ queryKey: ['my-fivem-characters'] });
      queryClient.invalidateQueries({ queryKey: ['my-companies'] });
    },
    onError: () => toast('Impossible de changer de personnage.', 'error'),
  });

  if (!data || !data.ok || data.characters.length === 0) return null;
  const selected = data.selected;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <UserRound className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Mon personnage</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Choisis le personnage que tu joues : ton accès entreprise suit son job.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.characters.map((c) => {
          const active = c.name === selected;
          const pending = select.isPending && select.variables === c.name;
          return (
            <button
              key={c.name}
              disabled={select.isPending}
              onClick={() => {
                if (!active) select.mutate(c.name);
              }}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                active ? 'border-primary/60 bg-primary/5' : 'hover:border-primary/40 hover:bg-accent'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.name || '—'}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Briefcase className="h-3 w-3" />
                  {c.unemployed ? 'Chômage' : `${c.job} · ${c.gradeLabel}`}
                </div>
              </div>
              {pending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                active && <Check className="h-4 w-4 shrink-0 text-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
