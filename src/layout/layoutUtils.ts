import type { AddPanelOptions, DockviewApi } from 'dockview';
import { defaultLayout } from './defaultLayout';
import { panelRegistry } from './panelRegistry';
import type { PanelId } from './types';

export function applyDefaultLayout(api: DockviewApi): void {
  for (const placement of defaultLayout) {
    const def = panelRegistry[placement.id];
    const options: AddPanelOptions = {
      id: placement.id,
      component: placement.id,
      title: def.title,
    };

    if (placement.initialWidth) {
      options.initialWidth = placement.initialWidth;
    }
    if (placement.initialHeight) {
      options.initialHeight = placement.initialHeight;
    }
    if (placement.relativeTo) {
      options.position = {
        referencePanel: placement.relativeTo,
        direction: placement.direction ?? 'right',
      };
    }

    api.addPanel(options);
  }
}

export function openPanel(api: DockviewApi, id: PanelId): void {
  const existing = api.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }

  const def = panelRegistry[id];
  const placement = defaultLayout.find((entry) => entry.id === id);
  const options: AddPanelOptions = {
    id,
    component: id,
    title: def.title,
  };

  if (placement?.initialWidth) {
    options.initialWidth = placement.initialWidth;
  }
  if (placement?.initialHeight) {
    options.initialHeight = placement.initialHeight;
  }
  if (placement?.relativeTo) {
    options.position = {
      referencePanel: placement.relativeTo,
      direction: placement.direction ?? 'right',
    };
  }

  api.addPanel(options);
}
