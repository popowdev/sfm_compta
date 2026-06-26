import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notif,
} from '@/lib/notifications';

function fmtAgo(d: string): string {
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['notifications'], queryFn: getNotifications });
  const unread = q.data?.unread ?? 0;
  const list = q.data?.notifications ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });
  const readOne = useMutation({ mutationFn: (id: number) => markNotificationRead(id), onSuccess: invalidate });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const onItem = (n: Notif) => {
    if (!n.read) readOne.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label={`Notifications${unread > 0 ? ` (${unread} non lues)` : ''}`}
        className={`relative grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground ${
          open ? 'bg-sidebar-accent text-foreground' : ''
        }`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute bottom-full z-50 mb-2 w-80 overflow-hidden rounded-xl border bg-card shadow-xl ${
            collapsed ? 'left-0' : 'left-0'
          }`}
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => readAll.mutate()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Check className="h-3.5 w-3.5" /> Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune notification.</div>
            ) : (
              list.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onItem(n)}
                  className={`flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent ${
                    n.read ? '' : 'bg-primary/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className="flex-1 truncate text-sm font-medium">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{fmtAgo(n.createdAt)}</span>
                  </div>
                  {n.body && <span className="truncate pl-3.5 text-xs text-muted-foreground">{n.body}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
