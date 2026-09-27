import { THEME_COLORS, type Theme } from './model.ts';

const freezeTransitions = (): (() => void) => {
  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(style);
  return () =>
    requestAnimationFrame(() => requestAnimationFrame(() => style.remove()));
};

export const applyThemeToDocument = (theme: Theme, freeze = false): void => {
  const unfreeze = freeze ? freezeTransitions() : undefined;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const meta =
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]') ??
    document.head.appendChild(
      Object.assign(document.createElement('meta'), { name: 'theme-color' }),
    );
  meta.content = THEME_COLORS[theme];
  unfreeze?.();
};

export const bootstrapSource = (initialTheme: Theme): string =>
  `(function(){try{var n='kui-theme',m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)')),t=m?decodeURIComponent(m[1]):'${initialTheme}';if(t!=='light'&&t!=='dark')t='dark';var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.setAttribute('data-theme',t);r.style.colorScheme=t;var e=document.querySelector('meta[name="theme-color"]');if(e)e.setAttribute('content',t==='dark'?'${THEME_COLORS.dark}':'${THEME_COLORS.light}')}catch(e){}})()`;
