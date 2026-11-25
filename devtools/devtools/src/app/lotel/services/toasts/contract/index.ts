import { Context } from 'effect';
import type { Effect } from 'effect';

export interface Toast {
  readonly type: 'success' | 'error';
  readonly title: string;
  readonly description?: string | undefined;
}

export interface ToastsService {
  readonly show: (toast: Toast) => Effect.Effect<void>;
}

export class Toasts extends Context.Service<Toasts, ToastsService>()(
  'Lotel/service/Toasts',
) {}
