import { isModifier, type Modifier, nameOf } from '../key/index.ts';
import { isTextEntry } from './text-entry.ts';

/**
 * Marks an element and everything in it: `enabled` sends its keys to
 * Shortcuts and Sequences before the element, even in Text Entry; `disabled`
 * keeps its keys from every listener. The nearest one decides.
 */
export const KEYS_ATTRIBUTE = 'data-keys';

/** Where the keys the page may hear go. */
export type KeySink = {
  /** A key went down: it joins the Keys. */
  readonly down: (code: string, name: string) => void;
  /** A key that went down lifted. */
  readonly up: (code: string) => void;
  /**
   * A key other than a modifier went down, in Text Entry or not; it may be
   * a Shortcut's or a Sequence's. Returns whether one Took it.
   */
  readonly press: (name: string, textEntry: boolean) => boolean;
  /** The page lost focus: every key lifted. */
  readonly interrupt: () => void;
};

const FLAGS: ReadonlyArray<readonly [Modifier, keyof KeyboardEvent]> = [
  ['Shift', 'shiftKey'],
  ['Control', 'ctrlKey'],
  ['Alt', 'altKey'],
  ['Meta', 'metaKey'],
];

const elementOf = (event: Event) => {
  const target = event.composedPath()[0] ?? event.target;
  return target instanceof Element ? target : null;
};

const markOf = (element: Element | null) =>
  element?.closest(`[${KEYS_ATTRIBUTE}]`)?.getAttribute(KEYS_ATTRIBUTE);

/**
 * Listens to every key on the page and gives the sink only what the page
 * may hear. It keeps from it a key typed while composing text, one a
 * component already used, one in Text Entry without Ctrl, Alt or Cmd, and
 * anything in a `disabled` element; it hears an `enabled` element's keys
 * before the element does. Escape in Text Entry leaves it. Modifiers are
 * always heard. Every key it reports down it reports up exactly once, even
 * when the browser loses the release, and it never reports the browser's
 * own repeats.
 */
export const createKeyInput = (target: Window, sink: KeySink) => {
  // Keys reported down, by code, and those a listener Took.
  const down = new Map<string, string>();
  const taken = new Set<string>();
  const handled = new WeakSet<Event>();

  const lift = (code: string) => {
    if (!down.delete(code)) return;
    taken.delete(code);
    sink.up(code);
  };

  // Brings the modifiers in line with what the browser says is down.
  const sync = (event: KeyboardEvent) => {
    for (const [modifier, flag] of FLAGS) {
      const codes = [...down].filter(([, name]) => name === modifier);
      if (event[flag] === true && codes.length === 0) {
        down.set(modifier, modifier);
        sink.down(modifier, modifier);
      }
      if (event[flag] === false) for (const [code] of codes) lift(code);
    }
  };

  const press = (event: KeyboardEvent, name: string, textEntry: boolean) => {
    if (event.repeat) {
      if (taken.has(event.code)) event.preventDefault();
      return taken.has(event.code);
    }
    if (!textEntry) {
      down.set(event.code, name);
      sink.down(event.code, name);
    }
    const took = sink.press(name, textEntry);
    if (took) taken.add(event.code);
    if (took) event.preventDefault();
    return took;
  };

  // Every key is first seen here, before any element: modifiers, and the
  // keys of `enabled` elements.
  const capture = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    const name = nameOf(event);
    if (isModifier(name)) {
      if (!event.repeat && !down.has(event.code)) {
        down.set(event.code, name);
        sink.down(event.code, name);
      }
      sync(event);
      handled.add(event);
      return;
    }
    sync(event);
    if (markOf(elementOf(event)) !== 'enabled') return;
    handled.add(event);
    if (press(event, name, false)) event.stopPropagation();
  };

  // Every other key, after the page had its turn.
  const bubble = (event: KeyboardEvent) => {
    if (handled.has(event) || event.isComposing || event.keyCode === 229) {
      return;
    }
    const element = elementOf(event);
    if (markOf(element) === 'disabled' || event.defaultPrevented) return;
    const name = nameOf(event);
    const textEntry = isTextEntry(element);
    if (textEntry && name === 'Escape') {
      element.blur();
      return;
    }
    if (textEntry && !event.ctrlKey && !event.altKey && !event.metaKey) return;
    press(event, name, textEntry);
  };

  const release = (event: KeyboardEvent) => {
    taken.delete(event.code);
    lift(event.code);
    // macOS sends no release for keys lifted while Cmd is down.
    if (nameOf(event) === 'Meta') {
      for (const [code, name] of down) if (!isModifier(name)) lift(code);
    }
    sync(event);
  };

  const interrupt = () => {
    if (down.size === 0) return;
    down.clear();
    taken.clear();
    sink.interrupt();
  };

  const hidden = () => {
    if (target.document.visibilityState === 'hidden') interrupt();
  };

  return {
    start: () => {
      target.addEventListener('keydown', capture, true);
      target.addEventListener('keydown', bubble);
      target.addEventListener('keyup', release, true);
      target.addEventListener('blur', interrupt);
      target.document.addEventListener('visibilitychange', hidden);
    },
    stop: () => {
      target.removeEventListener('keydown', capture, true);
      target.removeEventListener('keydown', bubble);
      target.removeEventListener('keyup', release, true);
      target.removeEventListener('blur', interrupt);
      target.document.removeEventListener('visibilitychange', hidden);
      interrupt();
    },
  };
};

export type KeyInput = ReturnType<typeof createKeyInput>;
