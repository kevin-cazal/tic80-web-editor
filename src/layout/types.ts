import type { FunctionComponent } from 'react';
import type { Direction, DockviewPanelRenderer, IDockviewPanelProps } from 'dockview';

export const PANEL_IDS = ['tic', 'editor', 'repl'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const ESSENTIAL_PANEL_IDS: readonly PanelId[] = ['tic', 'editor', 'repl'];

export type PanelComponent = FunctionComponent<IDockviewPanelProps>;

export interface PanelDefinition {
  component: PanelComponent;
  title: string;
  renderer?: DockviewPanelRenderer;
}

export interface DefaultPanelPlacement {
  id: PanelId;
  relativeTo?: PanelId;
  direction?: Direction;
  initialWidth?: number;
  initialHeight?: number;
}

export const LAYOUT_VERSION = 5;
export const LAYOUT_STORAGE_KEY = 'tic80-web-editor-layout';
