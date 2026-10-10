import type { CDPSession, Page } from 'playwright-core';

import type { StepRequest } from '../../../story/index.js';
import type { DeviceKind } from '../../../story/schema/index.js';
import {
  centerOf,
  keyLabel,
  reveal,
  settleScroll,
  sleep,
  travel,
  type Point,
} from './motion.js';
import { dispatchFingers, fingerPaths, tapHold } from './touch.js';

/** Performs Steps on one page the way a person would be seen doing them. */
export interface TabDriver {
  readonly perform: (
    request: Exclude<StepRequest, { readonly kind: 'close' }>,
  ) => Promise<unknown>;
  /** Shows the pointer where the mouse rests once a page has loaded. */
  readonly rest: () => Promise<void>;
}

/** How long the screen rests after each Step, so a person watching can see what changed. */
const stepRest = 700;
/** How long each typed key takes. */
const keyDelay = 100;

export function makeTabDriver(
  page: Page,
  cdp: CDPSession,
  kind: DeviceKind,
): TabDriver {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  let pointer: Point = { x: viewport.width / 2, y: viewport.height / 2 };

  const touchTarget = async (target: string) => {
    const locator = page.locator(target);
    await reveal(page, locator);
    const box = await locator.boundingBox();
    if (box === null) throw new Error(`${target} is not visible`);
    return {
      center: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      size: Math.min(box.width, box.height),
    };
  };

  const click = async (target: string) => {
    const locator = page.locator(target);
    await reveal(page, locator);
    if (kind === 'mobile') {
      await locator.tap({ trial: true });
      const at = await centerOf(locator);
      await dispatchFingers(cdp, [
        [
          { ...at, t: 0 },
          { ...at, t: tapHold },
        ],
      ]);
    } else {
      const at = await centerOf(locator);
      await travel(page, pointer, at);
      pointer = at;
      await locator.click();
    }
  };

  const perform: TabDriver['perform'] = async (request) => {
    switch (request.kind) {
      case 'click':
        await click(request.target);
        return sleep(stepRest);
      case 'type':
        await click(request.target);
        await page.locator(request.target).pressSequentially(request.text, {
          delay: keyDelay,
        });
        return sleep(stepRest);
      case 'press':
        for (const key of request.keys) {
          await page.evaluate(
            `window.__laymosKey?.(${JSON.stringify(keyLabel(key))})`,
          );
          await page.keyboard.press(key);
          await sleep(380);
        }
        return sleep(stepRest);
      case 'scroll':
        if (typeof request.to === 'string') {
          await reveal(page, page.locator(request.to), true);
        } else {
          const top = request.to.y;
          await page.evaluate(
            (y) => scrollTo({ top: y, behavior: 'smooth' }),
            top,
          );
          await settleScroll(page);
        }
        return sleep(stepRest);
      case 'gesture':
        if (kind !== 'mobile') {
          throw new Error('Gestures need a mobile Device');
        }
        await dispatchFingers(
          cdp,
          await fingerPaths(request.gesture, touchTarget),
        );
        return sleep(stepRest);
      case 'wait':
        return page.locator(request.target).waitFor();
      case 'screenshot':
        return undefined;
      case 'raw':
        return request.run(page);
    }
  };

  return {
    perform,
    rest: async () => {
      if (kind === 'desktop') await page.mouse.move(pointer.x, pointer.y);
    },
  };
}
