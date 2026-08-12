import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Plus, Trash2, GripVertical, FolderPlus, ChevronUp, ChevronDown, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { moduleIcon } from '@/lib/moduleIcons';
import { saveMenuLayout, type MenuCategory, type MenuLayoutItem, type MenuLayout } from '@/lib/me';

const NONE = '__none__';
const inputCls = 'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring';

type Containers = Record<string, string[]>;

const findContainer = (map: Containers, id: string): string | null => {
  if (Object.prototype.hasOwnProperty.call(map, id)) return id;
  return Object.keys(map).find((cid) => (map[cid] ?? []).includes(id)) ?? null;
};

function ChipInner({ label, moduleKey, dragging }: { label: string; moduleKey: string; dragging?: boolean }) {
  const Icon = moduleIcon(moduleKey);
  return (
    <div
      className={`flex select-none items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm ${
        dragging ? 'shadow-lg ring-2 ring-primary/50' : ''
      }`}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function SortableChip({ moduleKey, label }: { moduleKey: string; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: moduleKey });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab touch-none active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <ChipInner label={label} moduleKey={moduleKey} />
    </div>
  );
}

function Zone({
  id,
  itemKeys,
  labelOf,
  placeholder,
}: {
  id: string;
  itemKeys: string[];
  labelOf: (k: string) => string;
  placeholder?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <SortableContext items={itemKeys} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`min-h-[44px] space-y-1.5 rounded-lg border border-dashed p-2 transition-colors ${
          isOver ? 'border-primary/60 bg-primary/10' : 'bg-muted/20'
        }`}
      >
        {itemKeys.map((k) => (
          <SortableChip key={k} moduleKey={k} label={labelOf(k)} />
        ))}
        {itemKeys.length === 0 && (
          <div className="px-1 py-2 text-center text-xs text-muted-foreground">{placeholder ?? 'Glisse des modules ici'}</div>
        )}
      </div>
    </SortableContext>
  );
}

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
  const [containers, setContainers] = useState<Containers>(() => {
    const known = new Set(modules.map((m) => m.key));
    const initialCats = initial?.categories ?? [];
    const validCat = new Set(initialCats.map((c) => c.id));
    const map: Containers = { [NONE]: [] };
    for (const c of initialCats) map[c.id] = [];
    const used = new Set<string>();
    for (const it of initial?.items ?? []) {
      if (!known.has(it.key) || used.has(it.key)) continue;
      const cid = it.categoryId && validCat.has(it.categoryId) ? it.categoryId : NONE;
      (map[cid] ??= []).push(it.key);
      used.add(it.key);
    }
    for (const m of modules) if (!used.has(m.key)) map[NONE]!.push(m.key);
    return map;
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newCat, setNewCat] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id);
    const overId = String(over.id);
    const overRect = over.rect;
    const activeRect = active.rect.current.translated;
    setContainers((prev) => {
      const activeContainer = findContainer(prev, activeKey);
      const overContainer = findContainer(prev, overId);
      if (!activeContainer || !overContainer || activeContainer === overContainer) return prev;
      const activeItems = prev[activeContainer] ?? [];
      const overItems = prev[overContainer] ?? [];
      if (!activeItems.includes(activeKey)) return prev;
      let newIndex: number;
      if (overId === overContainer) {
        newIndex = overItems.length;
      } else {
        const overIndex = overItems.indexOf(overId);
        const isBelow = activeRect && overRect ? activeRect.top > overRect.top + overRect.height / 2 : false;
        newIndex = overIndex >= 0 ? overIndex + (isBelow ? 1 : 0) : overItems.length;
      }
      return {
        ...prev,
        [activeContainer]: activeItems.filter((k) => k !== activeKey),
        [overContainer]: [...overItems.slice(0, newIndex), activeKey, ...overItems.slice(newIndex)],
      };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeKey = String(active.id);
    const overId = String(over.id);
    setContainers((prev) => {
      const activeContainer = findContainer(prev, activeKey);
      const overContainer = findContainer(prev, overId);
      if (!activeContainer || !overContainer || activeContainer !== overContainer) return prev;
      const items = prev[activeContainer] ?? [];
      const oldIndex = items.indexOf(activeKey);
      const newIndex = overId === overContainer ? items.length - 1 : items.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      return { ...prev, [activeContainer]: arrayMove(items, oldIndex, newIndex) };
    });
  };

  const addCat = () => {
    const name = newCat.trim();
    if (!name) return;
    const id = crypto.randomUUID().slice(0, 20);
    setCats((c) => [...c, { id, name }]);
    setContainers((m) => ({ ...m, [id]: [] }));
    setNewCat('');
  };
  const removeCat = (id: string) => {
    setContainers((m) => {
      const { [id]: removed = [], ...rest } = m;
      return { ...rest, [NONE]: [...(rest[NONE] ?? []), ...removed] };
    });
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
    mutationFn: () => {
      const items: MenuLayoutItem[] = [];
      for (const k of containers[NONE] ?? []) items.push({ key: k, categoryId: null });
      for (const c of cats) for (const k of containers[c.id] ?? []) items.push({ key: k, categoryId: c.id });
      return saveMenuLayout(companyId, { categories: cats, items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-companies'] });
      toast('Menu réorganisé.', 'success');
      onClose();
    },
    onError: () => toast('Échec de l’enregistrement.', 'error'),
  });

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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sans catégorie (haut du menu)</div>
              <Zone id={NONE} itemKeys={containers[NONE] ?? []} labelOf={labelOf} />
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
                <Zone id={cat.id} itemKeys={containers[cat.id] ?? []} labelOf={labelOf} />
              </div>
            ))}

            <div className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4 text-muted-foreground" />
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCat(); }} placeholder="Nom de la nouvelle catégorie" className={`${inputCls} flex-1`} />
              <Button type="button" variant="outline" onClick={addCat} disabled={!newCat.trim()}><Plus className="h-4 w-4" /> Catégorie</Button>
            </div>
          </div>

          <DragOverlay>
            {activeId ? <ChipInner label={labelOf(activeId)} moduleKey={activeId} dragging /> : null}
          </DragOverlay>
        </DndContext>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer le menu'}</Button>
        </div>
      </div>
    </div>
  );
}
