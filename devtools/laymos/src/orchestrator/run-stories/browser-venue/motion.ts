import type { Locator, Page } from 'playwright-core';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const frameMillis = 1000 / 60;

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calls `frame` with progress 0..1 once per ~60fps frame, on a fixed schedule so slow frames never stretch the motion. */
export async function animate(
  duration: number,
  frame: (progress: number) => Promise<void>,
): Promise<void> {
  const start = performance.now();
  for (let index = 1; ; index += 1) {
    const progress = Math.min(1, (index * frameMillis) / duration);
    await frame(progress);
    if (progress >= 1) return;
    await sleep(
      Math.max(0, start + (index + 1) * frameMillis - performance.now()),
    );
  }
}

/** Moves the mouse from `from` to `to` along a gentle eased arc. */
export async function travel(
  page: Page,
  from: Point,
  to: Point,
): Promise<void> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  const bend = Math.min(60, distance * 0.12);
  const control = {
    x: (from.x + to.x) / 2 - (dy / distance) * bend,
    y: (from.y + to.y) / 2 + (dx / distance) * bend,
  };
  const duration = Math.min(900, Math.max(500, 400 + distance * 0.5));
  await animate(duration, (progress) => {
    const t = easeInOutCubic(progress);
    const u = 1 - t;
    return page.mouse.move(
      u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      u * u * from.y + 2 * u * t * control.y + t * t * to.y,
    );
  });
}

/** Resolves once no scroll event has fired for a moment. */
export function settleScroll(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const begun = performance.now();
        let last = begun;
        const onScroll = () => {
          last = performance.now();
        };
        addEventListener('scroll', onScroll, { capture: true, passive: true });
        const tick = () => {
          const now = performance.now();
          if (now - last > 160 || now - begun > 4000) {
            removeEventListener('scroll', onScroll, { capture: true });
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** Glides the element into the middle of the viewport unless it is already fully shown. */
export async function reveal(
  page: Page,
  locator: Locator,
  always = false,
): Promise<void> {
  await locator.waitFor();
  const moved = await locator.evaluate((element, force) => {
    const box = element.getBoundingClientRect();
    const shown =
      box.top >= 0 &&
      box.left >= 0 &&
      box.bottom <= innerHeight &&
      box.right <= innerWidth;
    if (shown && !force) return false;
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
    return true;
  }, always);
  if (moved) await settleScroll(page);
}

export async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${String(locator)} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const keyLabels: Readonly<Record<string, string>> = {
  Meta: '⌘',
  Control: '⌃',
  ControlOrMeta: process.platform === 'darwin' ? '⌘' : '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Enter: '↵',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: '⌦',
  Tab: '⇥',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ' ': 'Space',
};

/** `'Meta+K'` reads as `⌘ K`. */
export function keyLabel(key: string): string {
  return key
    .split(/\+(?!$)/)
    .map(
      (part) =>
        keyLabels[part] ?? (part.length === 1 ? part.toUpperCase() : part),
    )
    .join(' ');
}
