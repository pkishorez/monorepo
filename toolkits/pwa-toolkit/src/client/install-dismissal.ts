const KEY = 'pwa-toolkit:install-dismissed-at';
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

// localStorage throws in some private modes; then dismissal lasts for the page only.
export const dismissedRecently = (now = Date.now()): boolean => {
  try {
    const at = Number(localStorage.getItem(KEY));
    return at > 0 && now - at < REMEMBER_MS;
  } catch {
    return false;
  }
};

export const rememberDismissal = (now = Date.now()): void => {
  try {
    localStorage.setItem(KEY, String(now));
  } catch {
    // see above
  }
};
