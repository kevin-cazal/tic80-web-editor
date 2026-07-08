import { useEffect } from 'react';
import { useAppServices } from '../providers/AppServicesProvider';
import { useLayoutApi } from '../layout/LayoutContext';

/**
 * Bridge between TIC-80 console commands and the app layout:
 * - `edit` focuses Monaco.
 * - `studio` brings the TIC-80 panel forward and focuses its canvas.
 */
export function EditBridgeHandler() {
  const { bridge } = useAppServices();
  const { openPanel } = useLayoutApi();

  useEffect(() => {
    const unsubs = [
      bridge.onEditRequested(() => {
        openPanel('editor');
      }),
      bridge.onStudioRequested(() => {
        openPanel('tic');
        requestAnimationFrame(() => {
          bridge.getCanvas()?.focus();
          bridge.unlockAudio();
        });
      }),
    ];

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [bridge, openPanel]);

  return null;
}
