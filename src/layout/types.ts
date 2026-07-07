import type { FunctionComponent } from 'react';
import type { Direction, IDockviewPanelProps } from 'dockview';

export const PANEL_IDS = ['tic', 'editor'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const ESSENTIAL_PANEL_IDS: readonly PanelId[] = ['tic', 'editor'];

export type PanelComponent = FunctionComponent<IDockviewPanelProps>;

export interface PanelDefinition {
  component: PanelComponent;
  title: string;
}

export interface DefaultPanelPlacement {
  id: PanelId;
  relativeTo?: PanelId;
  direction?: Direction;
  initialWidth?: number;
  initialHeight?: number;
}

export const LAYOUT_VERSION = 2;
export const LAYOUT_STORAGE_KEY = 'tic80-web-editor-layout';
