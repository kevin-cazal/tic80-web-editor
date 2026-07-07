import { useCallback, useEffect, useState } from 'react';
import type { IDockviewPanelHeaderProps } from 'dockview';

export function PanelTab({ api, containerApi }: IDockviewPanelHeaderProps) {
  const [title, setTitle] = useState(api.title);
  const [maximized, setMaximized] = useState(api.isMaximized());

  useEffect(() => {
    const disposables = [
      api.onDidTitleChange((event) => setTitle(event.title)),
      containerApi.onDidMaximizedGroupChange(() => setMaximized(api.isMaximized())),
    ];
    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [api, containerApi]);

  const toggleFullscreen = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (api.isMaximized()) {
        api.exitMaximized();
      } else {
        api.maximize();
      }
      setMaximized(api.isMaximized());
    },
    [api],
  );

  const onActionPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
  }, []);

  return (
    <div className="dv-default-tab">
      <span className="dv-default-tab-content">{title}</span>
      <button
        type="button"
        className="dv-default-tab-action panel-tab-fullscreen"
        title={maximized ? 'Restore panel' : 'Maximize panel'}
        aria-label={maximized ? 'Restore panel' : 'Maximize panel'}
        onPointerDown={onActionPointerDown}
        onClick={toggleFullscreen}
      >
        <i className={maximized ? 'fa-solid fa-compress' : 'fa-solid fa-expand'} aria-hidden />
      </button>
    </div>
  );
}
