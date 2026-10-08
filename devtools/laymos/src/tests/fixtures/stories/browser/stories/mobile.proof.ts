import { Effect } from 'effect';
import { Gesture, Proof } from '../../../../../story/index.js';

export default Proof.browser({
  title: 'You name a photo and zoom it with two fingers',
  page: (root) => {
    root.innerHTML = `
      <style>
        body { margin: 0; font: 16px system-ui, sans-serif; }
        #photo { margin: 120px auto 0; width: 260px; height: 260px; border-radius: 24px; background: linear-gradient(135deg, #f97316, #8b5cf6); touch-action: none; }
        #scale { text-align: center; font-size: 24px; }
        input { display: block; margin: 24px auto 0; font: inherit; padding: 8px; }
      </style>
      <input placeholder="Name the photo" />
      <div id="photo"></div>
      <p id="scale">1.00</p>`;
    const photo = root.querySelector<HTMLElement>('#photo')!;
    const readout = root.querySelector('#scale')!;
    let start = 0;
    let scale = 1;
    const spread = (touches: TouchList) =>
      Math.hypot(
        touches[0]!.clientX - touches[1]!.clientX,
        touches[0]!.clientY - touches[1]!.clientY,
      );
    photo.addEventListener('touchmove', (event) => {
      if (event.touches.length < 2) return;
      if (start === 0) start = spread(event.touches);
      scale = spread(event.touches) / start;
      photo.style.transform = `scale(${scale})`;
      readout.textContent = scale.toFixed(2);
    });
    photo.addEventListener('touchend', () => {
      start = 0;
    });
  },
  prepare: (browser) => browser.open('mobile'),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.type('Name the photo', 'input', 'Sunset');
      yield* tab.gesture('Pinch the photo open', Gesture.pinch('#photo', 2));
      return {
        name: yield* tab.evaluate(() => document.querySelector('input')!.value),
        scale: Number(yield* tab.text('#scale')),
      };
    }),
  verify: ({ name, scale }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the photo is named', name === 'Sunset');
      yield* Proof.assert('the photo doubled', scale > 1.8);
    }),
});
