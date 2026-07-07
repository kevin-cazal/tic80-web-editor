import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TicBridge } from '../bridge/TicBridge';

interface AppServicesContextValue {
  bridge: TicBridge;
  ready: boolean;
}

const AppServicesContext = createContext<AppServicesContextValue | null>(null);

export function AppServicesProvider({ children }: { children: ReactNode }) {
  const bridge = useMemo(() => new TicBridge(), []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    bridge.initialize().then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const value = useMemo(() => ({ bridge, ready }), [bridge, ready]);

  return <AppServicesContext.Provider value={value}>{children}</AppServicesContext.Provider>;
}

export function useAppServices(): AppServicesContextValue {
  const context = useContext(AppServicesContext);
  if (!context) {
    throw new Error('useAppServices must be used within AppServicesProvider');
  }
  return context;
}
