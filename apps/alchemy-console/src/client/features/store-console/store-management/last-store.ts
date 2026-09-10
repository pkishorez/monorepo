const key = 'alchemy-console-store';

// Browser storage may be unavailable (private mode, blocked site data); a missing memory is fine.
export function rememberStore(storeId: string) {
  try {
    window.localStorage.setItem(key, storeId);
  } catch {
    // ignore
  }
}

export function recallStore(): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
