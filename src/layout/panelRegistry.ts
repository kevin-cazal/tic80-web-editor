import { EditorPanel } from '../components/EditorPanel';
import { TicPanel } from '../components/TicPanel';
import type { PanelDefinition, PanelId } from './types';

export const panelRegistry: Record<PanelId, PanelDefinition> = {
  tic: {
    component: TicPanel,
    title: 'TIC-80',
  },
  editor: {
    component: EditorPanel,
    title: 'Editor',
  },
};

export const dockviewComponents = Object.fromEntries(
  Object.entries(panelRegistry).map(([id, def]) => [id, def.component]),
) as Record<PanelId, PanelDefinition['component']>;
