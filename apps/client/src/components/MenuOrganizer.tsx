import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, GripVertical, FolderPlus, ChevronUp, ChevronDown, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { moduleIcon } from '@/lib/moduleIcons';
import { saveMenuLayout, type MenuCategory, type MenuLayoutItem, type MenuLayout } from '@/lib/me';

const inputCls = 'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring';

export function MenuOrganizer({
  companyId,
  modules,
  initial,
  onClose,
}: {
  companyId: number;
  modules: { key: string; label: string }[];
  initial: MenuLayout | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const labelOf = (k: string) => modules.find((m) => m.key === k)?.label ?? k;

  const [cats, setCats] = useState<MenuCategory[]>(initial?.categories ?? []);
  const [items, setItems] = useState<MenuLayoutItem[]>(() => {
    const known = new Set(modules.map((m) => m.key));
    const fromInit = (initial?.items ?? []).filter((it) => known.has(it.key));
    const used = new Set(fromInit.map((it) => it.key));
    const rest = modules.filter((m) => !used.has(m.key)).map((m) => ({ key: m.key, categoryId: null }));
    return [...fromInit, ...rest];
  });
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [newCat, setNewCat] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const validCat = new Set(cats.map((c) => c.id));
  const catOf = (it: MenuLayoutItem): string | null => (it.categoryId && validCat.has(it.categoryId) ? it.categoryId : null);
  const itemsIn = (cid: string | null) => items.filter((it) => catOf(it) === cid);

  const move = (key: string, targetCid: string | null, beforeKey?: string) => {
    setItems((prev) => {
      const without = prev.filter((it) => it.key !== key);
      const moved: MenuLayoutItem = { key, categoryId: targetCid };
      if (beforeKey && beforeKey !== key) {
        const idx = without.findIndex((it) => it.key === beforeKey);
        if (idx >= 0) { without.splice(idx, 0, moved); return without; }
      }
      let lastIdx = -1;
      without.forEach((it, i) => { if (catOf(it) === targetCid) lastIdx = i; });
      without.splice(lastIdx + 1, 0, moved);
      return without;
    });
  };

  const addCat = () => {
    const name = newCat.trim();
    if (!name) return;
    setCats((c) => [...c, { id: crypto.randomUUID().slice(0, 20), name }]);
    setNewCat('');
  };
  const removeCat = (id: string) => {
    setItems((prev) => prev.map((it) => (it.categoryId === id ? { ...it, categoryId: null } : it)));
    setCats((c) => c.filter((x) => x.id !== id));
  };
  const renameCat = (id: string) => {
    const name = editName.trim();
    if (name) setCats((c) => c.map((x) => (x.id === id ? { ...x, name } : x)));
    setEditing(null);
  };
  const moveCat = (id: string, dir: -1 | 1) => {
    setCats((c) => {
      const i = c.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.length) return c;
      const copy = [...c];
      const [x] = copy.splice(i, 1);
      copy.splice(j, 0, x!);
      return copy;
    });
  };

  const save = useMutation({
    mutationFn: () => saveMenuLayout(companyId, { categories: cats, items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-companies'] });
      toast('Menu réorganisé.', 'success');
      onClose();
    },
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });

  const Chip = ({ it }: { it: MenuLayoutItem }) => {
    const Icon = moduleIcon(it.key);
    return (
      <div
        draggable
        onDragStart={() => setDragKey(it.key)}
        onDragEnd={() => setDragKey(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragKey) move(dragKey, catOf(it), it.key); }}
        className={`flex cursor-grab items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm active:cursor-grabbing ${dragKey === it.key ? 'opacity-40' : ''}`}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{labelOf(it.key)}</span>
      </div>
    );
  };

  const Zone = ({ cid, children }: { cid: string | null; children?: React.ReactNode }) => (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (dragKey) move(dragKey, cid); }}
      className="min-h-[44px] space-y-1.5 rounded-lg border border-dashed bg-muted/20 p-2"
    >
      {itemsIn(cid).map((it) => <Chip key={it.key} it={it} />)}
      {itemsIn(cid).length === 0 && <div className="px-1 py-2 text-center text-xs text-muted-foreground">{children ?? 'Glisse des modules ici'}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Organiser le menu</h2>
            <p className="text-xs text-muted-foreground">Glisse les modules, crée des catégories, réordonne-les.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sans catégorie (haut du menu)</div>
            <Zone cid={null} />
          </div>

          {cats.map((cat, ci) => (
            <div key={cat.id} className="rounded-lg border p-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                {editing === cat.id ? (
                  <>
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') renameCat(cat.id); if (e.key === 'Escape') setEditing(null); }} className={`${inputCls} flex-1`} />
                    <button type="button" onClick={() => renameCat(cat.id)} className="grid h-7 w-7 place-items-center rounded text-emerald-400 hover:bg-accent"><Check className="h-4 w-4" /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-semibold">{cat.name}</span>
                    <button type="button" onClick={() => moveCat(cat.id, -1)} disabled={ci === 0} title="Monter" className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => moveCat(cat.id, 1)} disabled={ci === cats.length - 1} title="Descendre" className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => { setEditing(cat.id); setEditName(cat.name); }} title="Renommer" className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => removeCat(cat.id)} title="Supprimer la catégorie" className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
              <Zone cid={cat.id} />
            </div>
          ))}

          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-muted-foreground" />
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCat(); }} placeholder="Nom de la nouvelle catégorie" className={`${inputCls} flex-1`} />
            <Button type="button" variant="outline" onClick={addCat} disabled={!newCat.trim()}><Plus className="h-4 w-4" /> Catégorie</Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer le menu'}</Button>
        </div>
      </div>
    </div>
  );
}
