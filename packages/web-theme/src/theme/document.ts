import {
  LEGACY_THEME_COOKIE,
  THEME_COLORS,
  THEME_COOKIE,
  type Theme,
} from './model.ts';

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

/** The system's setting, which holds until a choice is saved. */
export const systemTheme = (): Theme =>
  typeof matchMedia === 'function' && matchMedia(SYSTEM_DARK).matches
    ? 'dark'
    : 'light';

export const watchSystemTheme = (onChange: () => void): void => {
  if (typeof matchMedia !== 'function') return;
  matchMedia(SYSTEM_DARK).addEventListener('change', onChange);
};

const freezeTransitions = (): (() => void) => {
  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(style);
  return () =>
    requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
};

/**
 * Switches the root, the one way every app does: `data-theme` (which the
 * stylesheet's colours and `dark:` follow), the colour scheme, the root's
 * and body's colour, and every `theme-color` tag.
 */
export const applyThemeToDocument = (theme: Theme, freeze = false): void => {
  const unfreeze = freeze ? freezeTransitions() : undefined;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = THEME_COLORS[theme];
  if (document.body !== null) {
    document.body.style.backgroundColor = THEME_COLORS[theme];
  }

  const metas = [
    ...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  ];
  if (metas.length === 0) {
    metas.push(
      document.head.appendChild(
        Object.assign(document.createElement('meta'), { name: 'theme-color' }),
      ),
    );
  }
  for (const meta of metas) meta.content = THEME_COLORS[theme];
  unfreeze?.();
};

/**
 * The head script that switches the root before the first paint, as
 * `applyThemeToDocument` does: the saved Theme (under either cookie name),
 * else the system's.
 */
export const THEME_SCRIPT = `(function(){try{var d=document,s=function(n){var m=d.cookie.match(new RegExp('(?:^|; )'+n+'=(light|dark)(?:;|$)'));return m&&m[1]},t=s('${THEME_COOKIE}')||s('${LEGACY_THEME_COOKIE}')||(matchMedia('${SYSTEM_DARK}').matches?'dark':'light'),c=t==='dark'?'${THEME_COLORS.dark}':'${THEME_COLORS.light}',r=d.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t;r.style.backgroundColor=c;d.querySelectorAll('meta[name="theme-color"]').forEach(function(e){e.setAttribute('content',c)})}catch(e){}})()`;
