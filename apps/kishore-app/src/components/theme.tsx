type Theme = 'dark' | 'light';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

function animateTheme(theme: Theme) {
  document.startViewTransition(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  });
}
export const useTheme = create<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme: Theme) => {
        set({ theme });
        animateTheme(theme);
      },
      toggleTheme: () =>
        get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
    }),
    {
      name: 'theme',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// For paint.
export const paintTheme = () => {
  try {
    const theme = (JSON.parse(localStorage.getItem('theme') ?? '') as any).state
      .theme as Theme;

    if (theme === 'dark') {
      document.body.classList.add('dark');
    }
  } catch {
    document.body.classList.add('dark');
  }
};
