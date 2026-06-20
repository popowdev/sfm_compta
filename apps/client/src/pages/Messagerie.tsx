import { useModulePerms } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyMessages, sendMyMessage } from '@/lib/messages';
import { MessageThread, MessageComposer } from '@/components/MessageThread';

export default function Messagerie() {
  const { companyId, canCreate } = useModulePerms('messagerie');
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ['messages', companyId],
    queryFn: () => getMyMessages(companyId),
  });

  const send = useMutation({
    mutationFn: (body: string) => sendMyMessage(companyId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages', companyId] }),
  });

  const messages = q.data?.messages ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Échangez directement avec l'IRS (questions fiscales, justificatifs, litiges…).
      </p>
      <div className="rounded-xl border bg-card p-4">
        <div className="max-h-[55vh] overflow-y-auto pr-1">
          <MessageThread
            messages={messages}
            mineSide="company"
            emptyLabel="Aucun message. Démarrez la conversation avec l'IRS."
          />
        </div>
      </div>
      <MessageComposer onSend={(b) => send.mutate(b)} pending={send.isPending} disabled={!canCreate} />
    </div>
  );
}
