import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useModulePerms } from '@/lib/useCompany';
import { DocumentVault } from '@/components/DocumentVault';
import {
  getCompanyDocuments,
  uploadCompanyDocument,
  deleteCompanyDocument,
} from '@/lib/documents';

export default function Documents() {
  const { companyId, canCreate, canDelete } = useModulePerms('documents');
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['company-documents', companyId],
    queryFn: () => getCompanyDocuments(companyId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['company-documents', companyId] });

  return (
    <DocumentVault
      documents={q.data?.documents ?? []}
      isLoading={q.isLoading}
      canCreate={canCreate}
      canDelete={canDelete}
      onUpload={async (file, name, folder) => {
        await uploadCompanyDocument(companyId, file, name, folder);
        invalidate();
      }}
      onDelete={async (id) => {
        await deleteCompanyDocument(companyId, id);
        invalidate();
      }}
    />
  );
}
