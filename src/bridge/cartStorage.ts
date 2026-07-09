const CART_STORAGE_KEY = 'tic80-web-editor-cart';
const CART_STORAGE_VERSION = 1;

export interface StoredCart {
  version: number;
  text: string;
  ext: string;
  savedAt: number;
}

/**
 * Persist the full cart (code + embedded resource sections) so an accidental
 * reload does not lose work. The cart text is the complete, full-fidelity
 * project state, so a single string captures code, sprites, map, sfx, music,
 * and palette.
 */
export function saveCart(text: string, ext: string): void {
  if (!text.trim()) {
    return;
  }

  const payload: StoredCart = {
    version: CART_STORAGE_VERSION,
    text,
    ext,
    savedAt: Date.now(),
  };

  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    // Quota exceeded / storage disabled: keep the app usable, just skip autosave.
    console.warn('Cart autosave failed', err);
  }
}

export function loadSavedCart(): StoredCart | null {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredCart;
    if (parsed.version !== CART_STORAGE_VERSION || typeof parsed.text !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedCart(): void {
  try {
    localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // Ignore: nothing actionable if storage is unavailable.
  }
}
