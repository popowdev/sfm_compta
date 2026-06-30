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
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { ApiError } from '@/lib/api';
import type { DocItem } from '@/lib/documents';

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
  isLoading,
  canCreate,
  canDelete,
  onUpload,
  onDelete,
  emptyTitle = 'Aucun document',
  emptyHint = 'Les fichiers déposés apparaîtront ici.',
}: {
  documents: DocItem[];
  isLoading: boolean;
  canCreate: boolean;
  canDelete: boolean;
  onUpload: (file: File, name: string, folder: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
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

  const folders = [...new Set(documents.map((d) => d.folder).filter((f): f is string => !!f))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
  const shown = folderFilter ? documents.filter((d) => (d.folder ?? '') === folderFilter) : documents;

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      await onUpload(file, name, folder);
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
                placeholder="ex. convoi, décrets…"
                className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <datalist id="doc-folders">
                {folders.map((f) => (
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
      ) : documents.length === 0 ? (
        <EmptyState icon={FolderOpen} title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="space-y-3">
          {folders.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFolderFilter('')}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${!folderFilter ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
              >
                Tous ({documents.length})
              </button>
              {folders.map((f) => {
                const n = documents.filter((d) => d.folder === f).length;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFolderFilter(f)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${folderFilter === f ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                  >
                    <FolderOpen className="h-3 w-3" /> {f} ({n})
                  </button>
                );
              })}
            </div>
          )}
          <div className="overflow-hidden rounded-xl border bg-card">
            {shown.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Aucun document dans ce dossier.</div>
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
