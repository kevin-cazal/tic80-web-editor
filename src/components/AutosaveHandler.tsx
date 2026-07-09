import { useEffect } from 'react';
import { useAppServices } from '../providers/AppServicesProvider';
import { saveCart } from '../bridge/cartStorage';

const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Persists the full cart (code + resources) to localStorage on every change so
 * an accidental reload does not lose work. Writes are debounced while editing
 * and flushed synchronously on unload.
 */
export function AutosaveHandler() {
  const { bridge, ready } = useAppServices();

  useEffect(() => {
    if (!ready) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      saveCart(bridge.getCode(), bridge.getScriptExtension());
    };

    const scheduleSave = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        saveCart(bridge.getCode(), bridge.getScriptExtension());
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    const unsubs = [bridge.onCodeChange(scheduleSave), bridge.onLanguageChange(scheduleSave)];
    window.addEventListener('beforeunload', flush);

    return () => {
      window.removeEventListener('beforeunload', flush);
      if (timer) {
        clearTimeout(timer);
      }
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [bridge, ready]);

  return null;
}
