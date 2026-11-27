import { Effect } from 'effect';
import { Toasts } from '../contract/index.js';
import type { Toast } from '../contract/index.js';

export const fakeToasts = () => {
  const shown: Array<Toast> = [];
  const toasts = Toasts.of({
    show: (toast) => Effect.sync(() => void shown.push(toast)),
  });
  return { shown, toasts };
};
