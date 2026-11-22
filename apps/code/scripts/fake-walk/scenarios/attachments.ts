import type { Scenario } from './index.ts';
import { DISK } from './projects.ts';
import { replyWith, send } from './sessions.ts';

/*
 * Files with a message: one picked with the paperclip and one pasted, each
 * a chip under the Draft; sent, the file that is not an image is saved on
 * Studio's disk (seen in the bubble's tree), the image goes to the agent.
 */

/** A 2×2 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEJMDGgAQYGBgA/AwIBJ4N9KQAAAABJRU5ErkJggg==',
  'base64',
);

export const attachments: Scenario = {
  name: 'attachments',
  title: 'A file picked and an image pasted, sent, the file on the disk',
  needs: ['sessions'],
  run: async (walk) => {
    const { page, bubble } = walk;
    await replyWith(walk, 'echo');
    await bubble.close();

    walk.step('the paperclip picks notes.txt');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      walk.button('Attach files').click(),
    ]);
    await chooser.setFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Remember the index.\n'),
    });
    await walk.see('notes.txt');

    walk.step('an image pasted on the page');
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'dot.png', { type: 'image/png' }));
      const event = new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      });
      (document.activeElement ?? document.body).dispatchEvent(event);
    }, PNG.toString('base64'));
    await walk.see('dot.png');
    await walk.shot('chips');

    walk.step('sent: the file is saved on Studio, the image goes along');
    await send(page, 'Read my notes');
    await walk.see('echo: Read my notes');
    await walk.shot('sent');
    const tree = await bubble.model(DISK, ['tree']);
    const saved = tree.match(/\S*-notes\.txt(?=:)/)?.[0];
    console.log(`  saved: ${saved ?? 'nowhere'}`);
    if (saved === undefined) throw new Error('notes.txt is not on the disk');
    await bubble.host
      .locator('span.k', { hasText: '-notes.txt' })
      .first()
      .scrollIntoViewIfNeeded();
    await walk.shot('saved-in-bubble', { bubble: true });
  },
};
