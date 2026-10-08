import { Duration } from 'effect';

export interface FingerPoint {
  readonly x: number;
  readonly y: number;
  /** Milliseconds since the Gesture began. */
  readonly t: number;
}

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

/** One Gesture as plain data; the runner turns it into finger paths. Durations are milliseconds. */
export type Gesture =
  | { readonly kind: 'tap'; readonly target: string }
  | {
      readonly kind: 'press';
      readonly target: string;
      readonly duration: number;
    }
  | {
      readonly kind: 'swipe';
      readonly target: string;
      readonly direction: SwipeDirection;
      readonly distance: number;
      readonly duration: number;
      readonly fingers: number;
    }
  | {
      readonly kind: 'drag';
      readonly from: string;
      readonly to: string | { readonly x: number; readonly y: number };
      readonly duration: number;
    }
  | {
      readonly kind: 'pinch';
      readonly target: string;
      readonly scale: number;
      readonly duration: number;
    }
  | {
      readonly kind: 'rotate';
      readonly target: string;
      readonly degrees: number;
      readonly duration: number;
    }
  | {
      readonly kind: 'fingers';
      readonly paths: ReadonlyArray<ReadonlyArray<FingerPoint>>;
    };

/** A Gesture without an explicit duration lasts this long, so a person watching the Recording can follow it. */
const humanMillis = 1000;

function millis(input: Duration.Input | undefined): number {
  return input === undefined ? humanMillis : Duration.toMillis(input);
}

export const Gesture = {
  tap(target: string): Gesture {
    return { kind: 'tap', target };
  },

  press(target: string, duration?: Duration.Input): Gesture {
    return { kind: 'press', target, duration: millis(duration) };
  },

  swipe(
    target: string,
    direction: SwipeDirection,
    options?: {
      readonly distance?: number;
      readonly duration?: Duration.Input;
      readonly fingers?: number;
    },
  ): Gesture {
    return {
      kind: 'swipe',
      target,
      direction,
      distance: options?.distance ?? 200,
      duration: millis(options?.duration),
      fingers: options?.fingers ?? 1,
    };
  },

  drag(
    from: string,
    to: string | { readonly x: number; readonly y: number },
    options?: { readonly duration?: Duration.Input },
  ): Gesture {
    return { kind: 'drag', from, to, duration: millis(options?.duration) };
  },

  pinch(
    target: string,
    scale: number,
    options?: { readonly duration?: Duration.Input },
  ): Gesture {
    return {
      kind: 'pinch',
      target,
      scale,
      duration: millis(options?.duration),
    };
  },

  rotate(
    target: string,
    degrees: number,
    options?: { readonly duration?: Duration.Input },
  ): Gesture {
    return {
      kind: 'rotate',
      target,
      degrees,
      duration: millis(options?.duration),
    };
  },

  fingers(paths: ReadonlyArray<ReadonlyArray<FingerPoint>>): Gesture {
    return { kind: 'fingers', paths };
  },
};
