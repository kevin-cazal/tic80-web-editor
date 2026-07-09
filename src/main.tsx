import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './App';
import { AutosaveHandler } from './components/AutosaveHandler';
import { EditBridgeHandler } from './components/EditBridgeHandler';
import { LayoutProvider } from './layout/LayoutContext';
import { AppServicesProvider } from './providers/AppServicesProvider';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppServicesProvider>
      <LayoutProvider>
        <EditBridgeHandler />
        <AutosaveHandler />
        <AppShell />
      </LayoutProvider>
    </AppServicesProvider>
  </StrictMode>,
);
