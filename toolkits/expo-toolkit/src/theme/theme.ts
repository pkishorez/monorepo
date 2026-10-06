import { clsx, type ClassValue } from 'clsx';
import { useFonts } from 'expo-font';
import { twMerge } from 'tailwind-merge';
import { Uniwind, useUniwind } from 'uniwind';
import { faces } from './faces';

/** Merges class names; on a Tailwind conflict the later class wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * The scheme in use, `'light'` or `'dark'`, and a setter that also takes
 * `'system'` to follow the device. Uniwind applies a change natively, without
 * re-rendering the tree.
 */
export function useTheme() {
  const { theme } = useUniwind();
  return {
    theme: theme === 'dark' ? ('dark' as const) : ('light' as const),
    setTheme: (name: 'light' | 'dark' | 'system') => Uniwind.setTheme(name),
  };
}

/**
 * Loads the theme's Inter faces. Returns `true` once they are ready; render
 * nothing (or keep the splash screen up) until then, or text first draws in
 * the system face.
 */
export function useThemeFonts(): boolean {
  const [loaded, error] = useFonts(faces);
  // A face that fails to load falls back to the system font; that is no
  // reason to keep the app from starting.
  return loaded || error !== null;
}
