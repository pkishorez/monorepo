import Storage from 'expo-sqlite/kv-store';
import { setTheme, useTheme } from '@kstackz/expo-toolkit/theme';

// The theme the User chose on this phone; dark until then, as on the web.
const KEY = 'ledger.theme';
const DEFAULT_THEME = 'dark';

const saved = () => {
  const stored = Storage.getItemSync(KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
};

/** Puts back the theme chosen on this phone, else dark. Once, at launch. */
export const restoreTheme = () => setTheme(saved() ?? DEFAULT_THEME);

/**
 * Ledger's theme, light or dark, remembered on this phone as the web
 * remembers it in a cookie.
 */
export const useAppTheme = () => {
  const { theme } = useTheme();
  const choose = (next: 'light' | 'dark') => {
    Storage.setItemSync(KEY, next);
    setTheme(next);
  };
  return {
    theme,
    setTheme: choose,
    toggleTheme: () => choose(theme === 'dark' ? 'light' : 'dark'),
  };
};
