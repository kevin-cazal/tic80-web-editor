import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { DockviewApi } from 'dockview';
import { openPanel as openPanelUtil } from './layoutUtils';
import type { PanelId } from './types';

interface LayoutContextValue {
  setApi: (api: DockviewApi) => void;
  getApi: () => DockviewApi | null;
  openPanel: (id: PanelId) => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const apiRef = useRef<DockviewApi | null>(null);

  const value = useMemo<LayoutContextValue>(
    () => ({
      setApi(api: DockviewApi) {
        apiRef.current = api;
      },
      getApi() {
        return apiRef.current;
      },
      openPanel(id: PanelId) {
        if (apiRef.current) {
          openPanelUtil(apiRef.current, id);
        }
      },
    }),
    [],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayoutApi(): LayoutContextValue {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayoutApi must be used within LayoutProvider');
  }
  return context;
}
