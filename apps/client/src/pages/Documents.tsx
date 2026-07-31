import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useModulePerms } from '@/lib/useCompany';
import { DocumentVault } from '@/components/DocumentVault';
import {
  getCompanyDocuments,
  uploadCompanyDocument,
  deleteCompanyDocument,
  createDocFolder,
  renameDocFolder,
  deleteDocFolder,
  moveCompanyDocument,
} from '@/lib/documents';

export default function Documents() {
  const { companyId, canCreate, canDelete } = useModulePerms('documents');
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['company-documents', companyId],
    queryFn: () => getCompanyDocuments(companyId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['company-documents', companyId] });
  const canWrite = q.data?.canWrite ?? false;

  return (
    <DocumentVault
      documents={q.data?.documents ?? []}
      folders={q.data?.folders ?? []}
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
      onCreateFolder={canWrite ? async (name) => { await createDocFolder(companyId, name); invalidate(); } : undefined}
      onRenameFolder={canWrite ? async (from, to) => { await renameDocFolder(companyId, from, to); invalidate(); } : undefined}
      onDeleteFolder={canWrite ? async (name) => { await deleteDocFolder(companyId, name); invalidate(); } : undefined}
      onMoveDoc={canWrite ? async (id, folder) => { await moveCompanyDocument(companyId, id, folder); invalidate(); } : undefined}
    />
  );
}
