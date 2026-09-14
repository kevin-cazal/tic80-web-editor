import type { DefaultPanelPlacement } from './types';

export const defaultLayout: DefaultPanelPlacement[] = [
  { id: 'tic', initialWidth: 420 },
  { id: 'editor', relativeTo: 'tic', direction: 'right' },
  { id: 'repl', relativeTo: 'editor', direction: 'below', initialHeight: 240 },
];
