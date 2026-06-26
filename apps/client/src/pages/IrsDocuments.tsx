import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentVault } from '@/components/DocumentVault';
import { SearchInput } from '@/components/ui/filters';
import { getIrsDocuments, uploadIrsDocument, deleteIrsDocument } from '@/lib/documents';

export default function IrsDocuments() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['irs-documents'], queryFn: getIrsDocuments });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['irs-documents'] });

  const [search, setSearch] = useState('');

  const documents = q.data?.documents ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((d) =>
      [d.name, d.uploadedByName].some((f) => (f ?? '').toLowerCase().includes(term)),
    );
  }, [documents, search]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Espace de stockage de l’IRS — documents partagés entre agents.
      </p>
      <div className="mt-6 space-y-4">
        {documents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher un document…"
              className="flex-1 min-w-[12rem] sm:w-64 sm:flex-none"
            />
            <span className="ml-auto text-sm text-muted-foreground">{filtered.length} résultat(s)</span>
          </div>
        )}
        <DocumentVault
          documents={filtered}
          isLoading={q.isLoading}
          canCreate
          canDelete
          emptyTitle={documents.length > 0 ? 'Aucun résultat' : 'Aucun document'}
          emptyHint={documents.length > 0 ? 'Aucun document ne correspond à ta recherche.' : 'Les fichiers déposés apparaîtront ici.'}
          onUpload={async (file, name) => {
            await uploadIrsDocument(file, name);
            invalidate();
          }}
          onDelete={async (id) => {
            await deleteIrsDocument(id);
            invalidate();
          }}
        />
      </div>
    </div>
  );
}
