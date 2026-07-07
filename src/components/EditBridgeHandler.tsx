import { useEffect } from 'react';
import { useAppServices } from '../providers/AppServicesProvider';
import { useLayoutApi } from '../layout/LayoutContext';

/** Focus Monaco when TIC-80 `edit` command is used in the patched WASM build. */
export function EditBridgeHandler() {
  const { bridge } = useAppServices();
  const { openPanel } = useLayoutApi();

  useEffect(() => {
    return bridge.onEditRequested(() => {
      openPanel('editor');
    });
  }, [bridge, openPanel]);

  return null;
}
