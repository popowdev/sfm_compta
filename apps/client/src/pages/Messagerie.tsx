import { useState } from 'react';
import { useModulePerms } from '@/lib/useCompany';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyMessages, sendMyMessage } from '@/lib/messages';
import { MessageThread, MessageComposer } from '@/components/MessageThread';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

export default function Messagerie() {
  const { companyId, canCreate } = useModulePerms('messagerie');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [sentTick, setSentTick] = useState(0);

  const q = useQuery({
    queryKey: ['messages', companyId],
    queryFn: () => getMyMessages(companyId),
  });

  const send = useMutation({
    mutationFn: (body: string) => sendMyMessage(companyId, body),
    onSuccess: () => {
      setSentTick((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ['messages', companyId] });
    },
    onError: () => toast("Échec de l'envoi du message. Réessaie.", 'error'),
  });

  const messages = q.data?.messages ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Échangez directement avec l'IRS (questions fiscales, justificatifs, litiges…).
      </p>
      <div className="rounded-xl border bg-card p-4">
        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {q.isLoading ? (
            <div className="space-y-3">
              <div className="flex justify-start">
                <Skeleton className="h-12 w-[60%] rounded-xl" />
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-16 w-[70%] rounded-xl" />
              </div>
              <div className="flex justify-start">
                <Skeleton className="h-10 w-[50%] rounded-xl" />
              </div>
            </div>
          ) : q.isError ? (
            <div className="grid place-items-center py-12 text-sm text-muted-foreground">
              Impossible de charger la conversation. Réessaie.
            </div>
          ) : (
            <MessageThread
              messages={messages}
              mineSide="company"
              emptyLabel="Aucun message. Démarrez la conversation avec l'IRS."
            />
          )}
        </div>
      </div>
      <MessageComposer onSend={(b) => send.mutate(b)} pending={send.isPending} disabled={!canCreate} clearSignal={sentTick} />
    </div>
  );
}
