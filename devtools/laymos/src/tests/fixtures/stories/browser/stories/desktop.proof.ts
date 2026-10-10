import { Effect } from 'effect';
import { Proof } from '../../../../../story/index.js';

export default Proof.browser({
  title: 'A person adds a note and jumps with a shortcut',
  page: (root) => {
    root.innerHTML = `
      <style>
        body { margin: 0; font: 16px system-ui, sans-serif; background: #f8fafc; }
        main { max-width: 640px; margin: 0 auto; padding: 32px; }
        input { font: inherit; padding: 8px 12px; width: 320px; }
        button { font: inherit; padding: 8px 16px; }
        li { padding: 12px; border-bottom: 1px solid #e2e8f0; }
      </style>
      <main>
        <h1>Notes</h1>
        <input placeholder="Write a note" />
        <button>Add</button>
        <p id="shortcut">No shortcut yet</p>
        <ul>${Array.from({ length: 40 }, (_, index) => `<li>Note ${index + 1}</li>`).join('')}</ul>
        <p id="end">The end</p>
      </main>`;
    const input = root.querySelector('input')!;
    const list = root.querySelector('ul')!;
    root.querySelector('button')!.addEventListener('click', () => {
      const item = document.createElement('li');
      item.textContent = input.value;
      list.prepend(item);
      input.value = '';
    });
    addEventListener('keydown', (event) => {
      if (event.metaKey && event.key.toLowerCase() === 'k') {
        root.querySelector('#shortcut')!.textContent = 'Search opened';
      }
    });
  },
  prepare: (browser) => browser.open('desktop'),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.type('Write the note', 'input', 'Buy milk');
      yield* tab.click('Add it', 'role=button[name="Add"]');
      yield* tab.scroll('Read to the end', '#end');
      yield* tab.scroll('Back to the top', { y: 0 });
      yield* tab.press('Open search', 'Meta+K');
      const output = {
        first: yield* tab.text('li >> nth=0'),
        shortcut: yield* tab.text('#shortcut'),
      };
      const second = yield* tab.device.open('Second');
      yield* second.close('Close the second Tab');
      const third = yield* tab.device.open('Third');
      return { ...output, third };
    }),
  verify: (output) =>
    Effect.gen(function* () {
      yield* Proof.assert('the new note is first', output.first === 'Buy milk');
      yield* Proof.assert(
        'the shortcut opened search',
        output.shortcut === 'Search opened',
      );
    }),
});
