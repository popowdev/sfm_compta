import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { GuidedTour, type TourStep } from '@/components/GuidedTour';
import { useTourDemoControls } from '@/components/TourDemo';
import { MODULE_TOUR_STEPS } from '@/lib/moduleTours';

const flagKey = (moduleKey: string) => `rp_compta_tour_mod_${moduleKey}`;

export function ModuleTour({ moduleKey }: { moduleKey: string }) {
  const all = MODULE_TOUR_STEPS[moduleKey];
  const { setDemoModule } = useTourDemoControls();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);

  const start = () => {
    if (!all) return;
    setDemoModule(moduleKey);
    setTimeout(() => {
      setSteps(all.filter((s) => !s.target || document.querySelector(s.target)));
      setOpen(true);
    }, 500);
  };
  const close = () => {
    setOpen(false);
    setDemoModule(null);
    localStorage.setItem(flagKey(moduleKey), '1');
  };

  useEffect(() => {
    if (!all || localStorage.getItem(flagKey(moduleKey))) return;
    const t = window.setTimeout(start, 700);
    return () => window.clearTimeout(t);
  }, [moduleKey]);

  if (!all) return null;

  return (
    <>
      <button
        type="button"
        onClick={start}
        title="Revoir la présentation de ce module"
        className="fixed bottom-4 right-4 z-[2500] grid h-11 w-11 place-items-center rounded-full border border-primary/40 bg-primary/15 text-primary shadow-lg backdrop-blur transition-colors hover:bg-primary/25"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
      <GuidedTour steps={steps} open={open} onClose={close} />
    </>
  );
}
