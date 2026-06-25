import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentVault } from '@/components/DocumentVault';
import { getIrsDocuments, uploadIrsDocument, deleteIrsDocument } from '@/lib/documents';

export default function IrsDocuments() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['irs-documents'], queryFn: getIrsDocuments });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['irs-documents'] });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Espace de stockage de l’IRS — documents partagés entre agents.
      </p>
      <div className="mt-6">
        <DocumentVault
          documents={q.data?.documents ?? []}
          isLoading={q.isLoading}
          canCreate
          canDelete
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
