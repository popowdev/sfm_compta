import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentVault } from '@/components/DocumentVault';
import { AssocPage } from '@/components/AssocPage';
import {
  getAssociationDocuments,
  uploadAssociationDocument,
  deleteAssociationDocument,
} from '@/lib/associations';

function DocsBody({ associationId }: { associationId: number }) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['association-documents', associationId],
    queryFn: () => getAssociationDocuments(associationId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['association-documents', associationId] });

  return (
    <DocumentVault
      documents={q.data?.documents ?? []}
      isLoading={q.isLoading}
      canCreate={q.data?.canWrite ?? false}
      canDelete={q.data?.canWrite ?? false}
      onUpload={async (file, name, folder) => {
        await uploadAssociationDocument(associationId, file, name, folder);
        invalidate();
      }}
      onDelete={async (id) => {
        await deleteAssociationDocument(associationId, id);
        invalidate();
      }}
    />
  );
}

export default function AssociationDocuments() {
  return <AssocPage title="Documents">{(d) => <DocsBody associationId={d.association.id} />}</AssocPage>;
}
