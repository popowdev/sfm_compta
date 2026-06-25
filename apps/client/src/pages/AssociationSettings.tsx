import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AssocPage } from '@/components/AssocPage';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  uploadAssociationLogo,
  updateAssociationObjet,
  updateAssociation,
  deleteAssociation,
  type AssociationDetail,
} from '@/lib/associations';

const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

function SettingsBody({ detail }: { detail: AssociationDetail }) {
  const a = detail.association;
  const acc = detail.access;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [objet, setObjet] = useState(a.objet ?? '');
  const [name, setName] = useState(a.name);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['association', a.slug] });
    queryClient.invalidateQueries({ queryKey: ['my-associations'] });
    queryClient.invalidateQueries({ queryKey: ['irs-associations'] });
  };

  const logo = useMutation({
    mutationFn: (file: File) => uploadAssociationLogo(a.id, file),
    onSuccess: refresh,
    onError: () => toast('Échec de l’envoi du logo.', 'error'),
  });
  const saveObjet = useMutation({
    mutationFn: () => updateAssociationObjet(a.id, objet.trim()),
    onSuccess: () => {
      refresh();
      toast('Objet enregistré.', 'success');
    },
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });
  const saveName = useMutation({
    mutationFn: () => updateAssociation(a.id, { name: name.trim() }),
    onSuccess: () => {
      refresh();
      toast('Nom enregistré.', 'success');
    },
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });
  const setStatus = useMutation({
    mutationFn: (status: 'active' | 'dissolved') => updateAssociation(a.id, { status }),
    onSuccess: refresh,
    onError: () => toast('Échec.', 'error'),
  });
  const remove = useMutation({
    mutationFn: () => deleteAssociation(a.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-associations'] });
      navigate('/associations', { replace: true });
    },
    onError: () => toast('Échec de la suppression.', 'error'),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identité</h2>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background text-sm font-semibold text-primary">
            {a.logoUrl ? <img src={a.logoUrl} alt="" className="h-full w-full object-cover" /> : initials(a.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{a.name}</div>
            <div className="text-xs text-muted-foreground">{a.status === 'active' ? 'Active' : 'Dissoute'}</div>
          </div>
          <label className="cursor-pointer">
            <span className={buttonVariants({ variant: 'outline' })}>{logo.isPending ? 'Envoi…' : 'Changer le logo'}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) logo.mutate(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Objet</h2>
        <div className="rounded-xl border bg-card p-5">
          <textarea className={`${inputCls} h-20 py-2`} value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="But / objet de l’association" />
          <div className="mt-3 flex justify-end">
            <Button onClick={() => saveObjet.mutate()} disabled={saveObjet.isPending}>
              {saveObjet.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </section>

      {acc.isStaff && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Administration IRS</h2>
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <div>
              <span className="mb-1 block text-sm text-muted-foreground">Nom de l’association</span>
              <div className="flex gap-2">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
                <Button variant="outline" onClick={() => name.trim() && saveName.mutate()} disabled={!name.trim() || saveName.isPending}>
                  Renommer
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div>
                <div className="text-sm font-medium">Statut</div>
                <div className="text-xs text-muted-foreground">Une association dissoute reste consultable mais marquée comme telle.</div>
              </div>
              {a.status === 'active' ? (
                <Button variant="outline" onClick={() => setStatus.mutate('dissolved')} disabled={setStatus.isPending}>
                  Dissoudre
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setStatus.mutate('active')} disabled={setStatus.isPending}>
                  Réactiver
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div>
                <div className="text-sm font-medium text-destructive">Supprimer l’association</div>
                <div className="text-xs text-muted-foreground">Supprime définitivement l’association, ses membres, sa trésorerie et ses documents.</div>
              </div>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (await confirm({ title: 'Supprimer l’association ?', message: `${a.name} — action définitive.`, destructive: true })) remove.mutate();
                }}
                disabled={remove.isPending}
              >
                Supprimer
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function AssociationSettings() {
  return (
    <AssocPage title="Paramètres">
      {(d) => (d.access.canManageSettings ? <SettingsBody detail={d} /> : <Navigate to={`/association/${d.association.slug}`} replace />)}
    </AssocPage>
  );
}
