import { useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { X, ArrowLeft, ArrowRight, Check } from 'lucide-react';

export interface TourStep {
  target?: string;
  title: string;
  body: string;
}

interface Rect { top: number; left: number; width: number; height: number }

function readRect(sel: string | undefined): Rect | null {
  if (!sel) return null;
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function GuidedTour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = steps[i];
  const last = i === steps.length - 1;

  const recompute = useCallback(() => {
    const el = step?.target ? document.querySelector(step.target) : null;
    if (el) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    requestAnimationFrame(() => setRect(readRect(step?.target)));
  }, [step?.target]);

  useLayoutEffect(() => {
    if (!open) return;
    recompute();
    const id = window.setTimeout(recompute, 320);
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => { window.clearTimeout(id); window.removeEventListener('resize', recompute); window.removeEventListener('scroll', recompute, true); };
  }, [open, i, recompute]);

  useEffect(() => { if (open) setI(0); }, [open]);

  const next = useCallback(() => { if (last) onClose(); else setI((n) => Math.min(n + 1, steps.length - 1)); }, [last, onClose, steps.length]);
  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev, onClose]);

  if (!open || !step) return null;

  const pad = 8;
  const spot = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(360, vw - 24);
  let cardTop = vh / 2 - 90;
  let cardLeft = vw / 2 - cardW / 2;
  if (spot) {
    const below = spot.top + spot.height + 12;
    const roomBelow = vh - below;
    if (roomBelow > 200) cardTop = below;
    else cardTop = Math.max(12, spot.top - 210);
    cardLeft = Math.min(Math.max(12, spot.left), vw - cardW - 12);
  }

  return (
    <div className="fixed inset-0 z-[3000]" role="dialog" aria-modal="true">
      {spot ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary transition-all duration-300"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, boxShadow: '0 0 0 9999px rgba(2,6,23,0.78)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      )}

      <div
        className="absolute w-[360px] max-w-[calc(100vw-24px)] rounded-xl border border-border bg-popover p-4 shadow-2xl transition-all duration-300"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">Étape {i + 1}/{steps.length}</span>
          <button type="button" onClick={onClose} className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fermer le tutoriel"><X className="h-4 w-4" /></button>
        </div>
        <h3 className="text-sm font-bold">{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="mt-3 flex items-center gap-1.5">
          {steps.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />)}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Passer le tutoriel</button>
          <div className="flex gap-2">
            <button type="button" onClick={prev} disabled={i === 0} className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-sm disabled:opacity-40 hover:bg-accent"><ArrowLeft className="h-4 w-4" /></button>
            <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              {last ? <>Terminer <Check className="h-4 w-4" /></> : <>Suivant <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
