import type { Locator, Page } from 'playwright-core';

/*
 * The fake bubble, driven as a person drives it: open it, find a Fake and
 * the Instance a Control is on, fill the Control's form and Send. The
 * bubble lives in a Shadow DOM (`<kestack-fake-bubble>`); Playwright's CSS
 * locators pierce it.
 *
 * An Instance is named by its address as the bubble titles it, without
 * the `#n` each part carries: `Computers`, `Computers/computers[computer-1]`,
 * `Computers/computers[computer-1]/fileSystem`; a Fake's name alone is its root.
 */

/** A Control's fields by name: text and numbers typed, a choice picked, a switch set. */
export type Fields = Readonly<Record<string, string | number | boolean>>;

/** What the bubble said of a Control sent: handled, ignored, queued, refused, or why no Message. */
export type Said = string;

const plain = (address: string) => address.replace(/#\d+/g, '');

export class Bubble {
  readonly page: Page;
  readonly host: Locator;

  constructor(page: Page) {
    this.page = page;
    this.host = page.locator('kestack-fake-bubble');
  }

  /** Opens the panel, unless it is open. */
  async open() {
    const button = this.host.locator('button[aria-label="Fake world"]');
    if ((await button.getAttribute('aria-expanded')) !== 'true')
      await button.click();
    await this.host.locator('.panel').waitFor();
  }

  /** Closes the panel, so the app shows whole, and leaves the keyboard to the app. */
  async close() {
    const button = this.host.locator('button[aria-label="Fake world"]');
    if ((await button.getAttribute('aria-expanded')) === 'true')
      await this.host.locator('.panel button[aria-label="Close"]').click();
    // As a person going back to the app: keys pressed in the bubble stay there.
    await this.page.evaluate(() => {
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        focused.localName === 'kestack-fake-bubble'
      )
        focused.blur();
    });
  }

  /** The Instance at an address, every Instance above it opened. */
  async instance(address: string): Promise<Locator> {
    await this.open();
    const fake = address.split('/')[0]!;
    const section = this.host.locator(`section.fake[aria-label="${fake}"]`);
    const titles = await section
      .locator('details.instance > summary')
      .evaluateAll((summaries) =>
        summaries.map((summary) => summary.getAttribute('title') ?? ''),
      );
    // A Fake's name alone is its root, whatever its Actor is called.
    const target =
      titles.find((title) => plain(title) === address) ??
      (address === fake ? titles[0] : undefined);
    if (target === undefined)
      throw new Error(
        `No Instance at ${address}; the bubble has ${titles.map(plain).join(', ')}`,
      );
    // Open each Instance on the way down, as a person would.
    const above = titles.filter(
      (title) => title === target || target.startsWith(`${title}/`),
    );
    for (const title of above) {
      const details = section.locator(
        `details.instance:has(> summary[title="${title}"])`,
      );
      if ((await details.getAttribute('open')) === null)
        await details.locator(':scope > summary').click();
    }
    return section.locator(
      `details.instance:has(> summary[title="${target}"])`,
    );
  }

  /** Sends a Control from the Instance at an address, its fields filled; what the bubble said. */
  async send(address: string, control: string, fields: Fields = {}) {
    const instance = await this.instance(address);
    const details = instance.locator(':scope > details.control', {
      has: this.page.locator(`:scope > summary:text-is("${control}")`),
    });
    if ((await details.count()) === 0)
      throw new Error(`No Control "${control}" on ${address}`);
    if ((await details.getAttribute('open')) === null)
      await details.locator(':scope > summary').click();
    const form = details.locator(':scope > form');
    for (const [name, value] of Object.entries(fields)) {
      const field = form.locator(`[name="${name}"]`);
      const kind = await field.evaluate((element) =>
        element instanceof HTMLSelectElement
          ? 'choice'
          : element instanceof HTMLInputElement && element.type === 'checkbox'
            ? 'switch'
            : 'text',
      );
      if (kind === 'choice') await field.selectOption(String(value));
      else if (kind === 'switch') await field.setChecked(Boolean(value));
      else await field.fill(String(value));
    }
    // A Control may move the page at once (a sign-in comes back to `/`):
    // what the bubble said goes with it, and the Fake handled it.
    const moved = this.page
      .waitForEvent('framenavigated', {
        predicate: (frame) => frame === this.page.mainFrame(),
        timeout: 30_000,
      })
      .then(
        () => 'handled, and the page moved',
        () => new Promise<string>(() => undefined),
      );
    await form.locator('button[type=submit]').click();
    const said = await Promise.race([
      form
        .locator('[role=status]')
        .textContent()
        .then((text) => text ?? ''),
      moved,
    ]);
    console.log(`  bubble: ${address} · ${control} → ${said}`);
    return said;
  }

  /** Sends a Control and fails unless the Fake handled it. */
  async must(address: string, control: string, fields: Fields = {}) {
    const said = await this.send(address, control, fields);
    if (!said.startsWith('handled'))
      throw new Error(`${address} · ${control} was ${said}, not handled`);
  }

  /**
   * The Model of the Instance at an address as the bubble shows it, read as
   * text: the whole, or the part under the keys given, each one unfolded.
   */
  async model(address: string, keys: ReadonlyArray<string> = []) {
    const instance = await this.instance(address);
    let at = instance.locator(':scope > .json');
    for (const key of keys) {
      at = at.locator(`li:has(> span.k:text-is("${key}:"))`).first();
      const folded = at.locator(':scope > details');
      if (
        (await folded.count()) > 0 &&
        (await folded.getAttribute('open')) === null
      )
        await folded.locator(':scope > summary').click();
    }
    return (await at.innerText()).trim();
  }

  /** One plain value of a Model, at the keys given (`['jobs', '0', 'id']`). */
  async value(address: string, keys: ReadonlyArray<string>): Promise<unknown> {
    const text = await this.model(address, keys);
    return JSON.parse(text.slice(text.indexOf(':') + 1).trim());
  }
}
