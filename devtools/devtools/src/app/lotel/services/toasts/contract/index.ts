import { Context } from 'effect';
import type { Effect } from 'effect';

/* How the Lotel Tool tells the reader how something went: a toast. */

export interface Toast {
  readonly type: 'success' | 'error';
  readonly title: string;
  readonly description?: string | undefined;
}

export interface ToastsService {
  /** Shows `toast` to the reader. */
  readonly show: (toast: Toast) => Effect.Effect<void>;
}

export class Toasts extends Context.Service<Toasts, ToastsService>()(
  'Lotel/service/Toasts',
) {}
