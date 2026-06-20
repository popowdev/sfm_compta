import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Coffee, Square, Fingerprint } from 'lucide-react';
import {
  getMyTimeclock,
  clockStart,
  clockPause,
  clockResume,
  clockStop,
  fmtClock,
  parseLocal,
} from '@/lib/timeclock';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function QuickClock({
  companyId,
  pausesEnabled,
  collapsed,
}: {
  companyId: number;
  pausesEnabled: boolean;
  collapsed: boolean;
}) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['timeclock-me', companyId], queryFn: () => getMyTimeclock(companyId) });
  const employee = q.data?.employee ?? null;
  const current = q.data?.current ?? null;
  const paused = !!current?.pauseStart;
  const now = useNow(!!current && !paused);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['timeclock-me', companyId] });
    queryClient.invalidateQueries({ queryKey: ['timeclock', companyId] });
  };
  const start = useMutation({ mutationFn: () => clockStart(companyId), onSuccess: invalidate });
  const pause = useMutation({ mutationFn: () => clockPause(companyId), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => clockResume(companyId), onSuccess: invalidate });
  const stop = useMutation({ mutationFn: () => clockStop(companyId), onSuccess: invalidate });
  const busy = start.isPending || pause.isPending || resume.isPending || stop.isPending;

  if (!q.data || !employee) return null;

  let workedSec = 0;
  if (current) {
    const serverNow = parseLocal(q.data.now);
    const baseGross = (serverNow - parseLocal(current.clockIn)) / 1000;
    const basePause = current.pauseStart ? (serverNow - parseLocal(current.pauseStart)) / 1000 : 0;
    const baseWorked = baseGross - current.pauseMinutes * 60 - basePause;
    const sinceFetch = paused ? 0 : Math.max(0, (now - q.dataUpdatedAt) / 1000);
    workedSec = Math.max(0, baseWorked + sinceFetch);
  }
  const timer = fmtClock(workedSec);
  const stateColor = !current ? 'text-muted-foreground' : paused ? 'text-amber-400' : 'text-emerald-400';

  if (collapsed) {
    return (
      <div className="mb-2 flex flex-col items-center gap-1 border-b pb-2">
        <span className={`font-mono text-[10px] font-semibold tabular-nums ${stateColor}`}>
          {current ? timer.slice(0, 5) : '--:--'}
        </span>
        {!current ? (
          <button
            type="button"
            onClick={() => start.mutate()}
            disabled={busy}
            title="Prendre son service"
            aria-label="Prendre son service"
            className="grid h-8 w-8 place-items-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-600/90 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => stop.mutate()}
            disabled={busy}
            title="Fin de service"
            aria-label="Fin de service"
            className="grid h-8 w-8 place-items-center rounded-md bg-destructive text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            <Square className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-lg border bg-card/60 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Fingerprint className="h-3.5 w-3.5" /> Pointage
          {paused && <span className="font-semibold text-amber-400">· pause</span>}
        </span>
        <span className={`font-mono text-sm font-bold tabular-nums ${stateColor}`}>
          {current ? timer : '00:00:00'}
        </span>
      </div>
      <div className="flex gap-1.5">
        {!current ? (
          <button
            type="button"
            onClick={() => start.mutate()}
            disabled={busy}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 text-xs font-semibold text-white transition-colors hover:bg-emerald-600/90 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" /> Start
          </button>
        ) : (
          <>
            {paused ? (
              <button
                type="button"
                onClick={() => resume.mutate()}
                disabled={busy}
                className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-amber-500 text-xs font-semibold text-white transition-colors hover:bg-amber-500/90 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" /> Reprendre
              </button>
            ) : (
              pausesEnabled && (
                <button
                  type="button"
                  onClick={() => pause.mutate()}
                  disabled={busy}
                  className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-amber-500 text-xs font-semibold text-white transition-colors hover:bg-amber-500/90 disabled:opacity-50"
                >
                  <Coffee className="h-3.5 w-3.5" /> Pause
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => stop.mutate()}
              disabled={busy}
              className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-destructive text-xs font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" /> End
            </button>
          </>
        )}
      </div>
    </div>
  );
}
