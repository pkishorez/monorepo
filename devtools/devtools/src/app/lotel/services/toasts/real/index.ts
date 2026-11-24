import { Effect, Layer } from 'effect';
import { toast } from '@kestack/web-platform/ui/components/toast';
import { Toasts } from '../contract/index.js';

/** Toasts drawn by the page's toast stack. */
export const toastsLayer = Layer.succeed(Toasts)({
  show: (shown) =>
    Effect.sync(() => {
      toast.add(shown);
    }),
});
