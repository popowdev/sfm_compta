import { createContext, useContext, useState, type ReactNode } from 'react';

interface TourDemoCtx {
  demoModule: string | null;
  setDemoModule: (m: string | null) => void;
}

const Ctx = createContext<TourDemoCtx>({ demoModule: null, setDemoModule: () => {} });

export function TourDemoProvider({ children }: { children: ReactNode }) {
  const [demoModule, setDemoModule] = useState<string | null>(null);
  return <Ctx.Provider value={{ demoModule, setDemoModule }}>{children}</Ctx.Provider>;
}

export function useTourDemoControls() {
  return useContext(Ctx);
}

export function useTourDemoActive(moduleKey: string): boolean {
  return useContext(Ctx).demoModule === moduleKey;
}
