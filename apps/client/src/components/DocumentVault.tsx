import { useRef, useState } from 'react';
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  File as FileIcon,
  Download,
  Trash2,
  Upload,
  FolderOpen,
  Folder,
  FolderPlus,
  Pencil,
  Check,
  X,
  Files,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { ApiError } from '@/lib/api';
import type { DocItem, DocFolder } from '@/lib/documents';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
function fmtDateTime(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
function docIcon(mime: string): { Icon: LucideIcon; cls: string } {
  if (mime.startsWith('image/')) return { Icon: FileImage, cls: 'text-sky-400' };
  if (mime === 'application/pdf') return { Icon: FileText, cls: 'text-rose-400' };
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv')
    return { Icon: FileSpreadsheet, cls: 'text-emerald-400' };
  if (mime.includes('word') || mime === 'text/plain') return { Icon: FileText, cls: 'text-blue-400' };
  return { Icon: FileIcon, cls: 'text-muted-foreground' };
}

function uploadErrorMessage(e: unknown): string {
  const code = e instanceof ApiError ? e.code : null;
  if (code === 'file_too_large') return 'Fichier trop volumineux (20 Mo maximum).';
  if (code === 'invalid_upload') return 'Type de fichier non autorisé.';
  if (code === 'file_required') return 'Choisis un fichier.';
  return "Échec de l'envoi du fichier.";
}

const ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';

export function DocumentVault({
  documents,
  folders: foldersProp,
  isLoading,
  canCreate,
  canDelete,
  onUpload,
  onDelete,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveDoc,
  emptyTitle = 'Aucun document',
  emptyHint = 'Les fichiers déposés apparaîtront ici.',
}: {
  documents: DocItem[];
  folders?: DocFolder[];
  isLoading: boolean;
  canCreate: boolean;
  canDelete: boolean;
  onUpload: (file: File, name: string, folder: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCreateFolder?: (name: string) => Promise<void>;
  onRenameFolder?: (from: string, to: string) => Promise<void>;
  onDeleteFolder?: (name: string) => Promise<void>;
  onMoveDoc?: (id: number, folder: string | null) => Promise<void>;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [moveFor, setMoveFor] = useState<number | null>(null);

  const derived = [...new Set(documents.map((d) => d.folder).filter((f): f is string => !!f))];
  const folders: DocFolder[] = (foldersProp ?? derived.map((n) => ({ name: n, count: documents.filter((d) => d.folder === n).length })))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const folderNames = folders.map((f) => f.name);
  const shown = folderFilter ? documents.filter((d) => (d.folder ?? '') === folderFilter) : documents;
  const canManageFolders = !!onCreateFolder || !!onRenameFolder;

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      await onUpload(file, name, folder || folderFilter);
      setFile(null);
      setName('');
      setFolder('');
      if (fileRef.current) fileRef.current.value = '';
      toast('Document ajouté.', 'success');
    } catch (e) {
      toast(uploadErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: DocItem) => {
    if (await confirm({ title: 'Supprimer ce document ?', message: d.name, destructive: true })) {
      try {
        await onDelete(d.id);
      } catch {
        toast('Échec de la suppression.', 'error');
      }
    }
  };

  const createFolder = async () => {
    const n = newName.trim();
    if (!n || !onCreateFolder) return;
    try {
      await onCreateFolder(n);
      setCreating(false);
      setNewName('');
      setFolderFilter(n);
    } catch {
      toast('Impossible de créer le dossier.', 'error');
    }
  };
  const renameFolder = async (from: string) => {
    const to = editName.trim();
    if (!to || !onRenameFolder) { setEditing(null); return; }
    try {
      await onRenameFolder(from, to);
      if (folderFilter === from) setFolderFilter(to);
    } catch {
      toast('Renommage impossible.', 'error');
    } finally {
      setEditing(null);
    }
  };
  const deleteFolder = async (n: string, count: number) => {
    if (!onDeleteFolder) return;
    const ok = await confirm({
      title: 'Supprimer ce dossier ?',
      message: count > 0 ? `Les ${count} document(s) seront déplacés hors dossier (non supprimés).` : 'Ce dossier est vide.',
      destructive: true,
      confirmLabel: 'Supprimer le dossier',
    });
    if (!ok) return;
    try {
      await onDeleteFolder(n);
      if (folderFilter === n) setFolderFilter('');
    } catch {
      toast('Suppression impossible.', 'error');
    }
  };
  const moveDoc = async (id: number, target: string | null) => {
    if (!onMoveDoc) return;
    setMoveFor(null);
    try {
      await onMoveDoc(id, target);
      toast('Document déplacé.', 'success');
    } catch {
      toast('Déplacement impossible.', 'error');
    }
  };

  const FolderBtn = ({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string; count: number }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{count}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      {canCreate && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Fichier</span>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
              />
            </label>
            <label className="min-w-[10rem] flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">Nom (optionnel)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={file ? file.name : 'Nom du document'}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Dossier (optionnel)</span>
              <input
                list="doc-folders"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder={folderFilter || 'ex. convoi, décrets…'}
                className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <datalist id="doc-folders">
                {folderNames.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <Button onClick={submit} disabled={!file || busy}>
              <Upload className="h-4 w-4" />
              {busy ? 'Envoi…' : 'Ajouter'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Images, PDF, Word, Excel, PowerPoint, texte/CSV — 20 Mo max. Les autres types sont refusés.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : documents.length === 0 && folders.length === 0 ? (
        <EmptyState icon={FolderOpen} title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="w-full shrink-0 rounded-xl border bg-card p-2 md:w-56">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dossiers</span>
              {onCreateFolder && !creating && (
                <button type="button" onClick={() => setCreating(true)} title="Nouveau dossier" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                  <FolderPlus className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              <FolderBtn active={!folderFilter} onClick={() => setFolderFilter('')} icon={Files} label="Tous" count={documents.length} />
              {folders.map((f) => (
                <div key={f.name} className="group flex items-center gap-1">
                  {editing === f.name ? (
                    <div className="flex flex-1 items-center gap-1 px-1">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') renameFolder(f.name); if (e.key === 'Escape') setEditing(null); }}
                        className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button type="button" onClick={() => renameFolder(f.name)} className="grid h-6 w-6 place-items-center rounded text-emerald-400 hover:bg-accent"><Check className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setEditing(null)} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <FolderBtn active={folderFilter === f.name} onClick={() => setFolderFilter(f.name)} icon={folderFilter === f.name ? FolderOpen : Folder} label={f.name} count={f.count} />
                      </div>
                      {canManageFolders && (
                        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                          {onRenameFolder && (
                            <button type="button" onClick={() => { setEditing(f.name); setEditName(f.name); }} title="Renommer" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                          )}
                          {onDeleteFolder && (
                            <button type="button" onClick={() => deleteFolder(f.name, f.count)} title="Supprimer le dossier" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {creating && (
                <div className="flex items-center gap-1 px-1 pt-1">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
                    placeholder="Nom du dossier"
                    className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button type="button" onClick={createFolder} className="grid h-6 w-6 place-items-center rounded text-emerald-400 hover:bg-accent"><Check className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => { setCreating(false); setNewName(''); }} className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
            {shown.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Aucun document dans {folderFilter ? `« ${folderFilter} »` : 'cet espace'}.</div>
            ) : (
              shown.map((d, i) => {
                const { Icon, cls } = docIcon(d.mimeType);
                return (
                  <div key={d.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t' : ''}`}>
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
                      <Icon className={`h-[18px] w-[18px] ${cls}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{d.name}</span>
                        {d.folder && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            <FolderOpen className="h-3 w-3" /> {d.folder}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {fmtSize(d.size)} · {fmtDateTime(d.createdAt)}
                        {d.uploadedByName ? ` · ${d.uploadedByName}` : ''}
                      </div>
                    </div>
                    {onMoveDoc && (
                      <div className="relative shrink-0">
                        <button type="button" onClick={() => setMoveFor(moveFor === d.id ? null : d.id)} title="Déplacer vers un dossier" className="grid h-8 w-8 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                          <Folder className="h-4 w-4" />
                        </button>
                        {moveFor === d.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMoveFor(null)} />
                            <div className="absolute right-0 z-20 mt-1 max-h-64 w-48 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-lg">
                              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Déplacer vers</div>
                              <button type="button" onClick={() => moveDoc(d.id, null)} className={`block w-full rounded px-2 py-1.5 text-left hover:bg-accent ${!d.folder ? 'text-primary' : ''}`}>Hors dossier (racine)</button>
                              {folderNames.map((n) => (
                                <button key={n} type="button" onClick={() => moveDoc(d.id, n)} className={`block w-full truncate rounded px-2 py-1.5 text-left hover:bg-accent ${d.folder === n ? 'text-primary' : ''}`}>{n}</button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      title="Télécharger"
                      aria-label={`Télécharger ${d.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(d)}
                        title="Supprimer"
                        aria-label={`Supprimer ${d.name}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
