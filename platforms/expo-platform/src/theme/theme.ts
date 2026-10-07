import { clsx, type ClassValue } from 'clsx';
import { useFonts } from 'expo-font';
import { twMerge } from 'tailwind-merge';
import { Uniwind, useUniwind } from 'uniwind';
import { faces } from './faces';

/** Merges class names; on a Tailwind conflict the later class wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** A theme to use: light, dark, or `'system'` to follow the device. */
export type ThemeName = 'light' | 'dark' | 'system';

/**
 * Uses a theme from now on, outside React too (to restore a saved one at
 * launch). Uniwind applies it natively, without re-rendering the tree.
 */
export function setTheme(name: ThemeName): void {
  Uniwind.setTheme(name);
}

/** The scheme in use, `'light'` or `'dark'`, and `setTheme`. */
export function useTheme() {
  const { theme } = useUniwind();
  return {
    theme: theme === 'dark' ? ('dark' as const) : ('light' as const),
    setTheme,
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
