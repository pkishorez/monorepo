import { join } from 'node:path';
import type { Locator, Page } from 'playwright-core';
import { Bubble } from './bubble.ts';

/** Where the app is, and where its screenshots go. */
interface Where {
  readonly url: string;
  readonly shots: string;
  readonly prefix: string;
}

/** What a scenario walks with: the page, the bubble, and a few ways to look. */
export class Walk {
  readonly bubble: Bubble;
  /** What one scenario leaves for the next: ids and names it made. */
  readonly kept = new Map<string, string>();
  scenario = '';
  private shots = 0;

  readonly page: Page;
  private readonly where: Where;

  constructor(page: Page, where: Where) {
    this.page = page;
    this.where = where;
    this.bubble = new Bubble(page);
  }

  /** Goes to a path of the app. */
  async go(path: string) {
    await this.page.goto(new URL(path, this.where.url).href);
  }

  /** One step, said as it goes. */
  step(what: string) {
    console.log(`- ${what}`);
  }

  /** A screenshot, named for the scenario and the step, the bubble closed unless asked. */
  async shot(name: string, { bubble = false } = {}) {
    if (!bubble) await this.bubble.close();
    await this.page.waitForTimeout(300);
    this.shots += 1;
    const file = join(
      this.where.shots,
      `${this.where.prefix}-${this.scenario}-${String(this.shots).padStart(2, '0')}-${name}.png`,
    );
    await this.page.screenshot({ path: file });
    console.log(`  shot: ${file}`);
  }

  /** Waits until something with this text shows, in the page or in a part of it. */
  async see(text: string | RegExp, within: Locator | Page = this.page) {
    const found = within.getByText(text).filter({ visible: true }).first();
    await found.waitFor({ state: 'visible', timeout: 15_000 });
    return found;
  }

  /** Waits until a part of the page, read as a whole, says this; what it says then. */
  async says(within: Locator, said: RegExp, timeout = 15_000) {
    const start = Date.now();
    for (;;) {
      const now = await within.innerText().catch(() => '');
      if (said.test(now)) return now;
      if (Date.now() - start > timeout)
        throw new Error(`It says "${now.slice(0, 300)}", not ${said}`);
      await this.page.waitForTimeout(200);
    }
  }

  /** Waits until nothing with this text shows. */
  async gone(text: string | RegExp, within: Locator | Page = this.page) {
    await within
      .getByText(text)
      .filter({ visible: true })
      .first()
      .waitFor({ state: 'detached', timeout: 15_000 });
  }

  /** The app's main page, beside the sidebar. */
  get main() {
    return this.page.locator('main').filter({ visible: true }).first();
  }

  /** The button showing with this name, in the page or a part of it. */
  button(name: string | RegExp, within: Locator | Page = this.page) {
    return within
      .getByRole('button', { name })
      .filter({ visible: true })
      .first();
  }
}
