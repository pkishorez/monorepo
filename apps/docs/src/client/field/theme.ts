/*
 * Light or dark, as the page has it: the `dark` class on `<html>`, watched
 * so a switch reaches the field at once. The field fades its colours across
 * on its own.
 */

export type ThemeWatch = {
  readonly dark: () => boolean;
  readonly dispose: () => void;
};

export function watchTheme(): ThemeWatch {
  const read = () => document.documentElement.classList.contains('dark');
  let dark = read();
  const observer = new MutationObserver(() => {
    dark = read();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return { dark: () => dark, dispose: () => observer.disconnect() };
}
