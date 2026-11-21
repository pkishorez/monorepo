import { createElement, useCallback, useId, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { FlaskConicalIcon, XIcon } from 'lucide-react';
import type { Sent } from '@kestack/kabuki/types';
import { fieldsOf, messageOf, sendTo, wordsOf } from './controls.ts';
import type { Control, FormField } from './controls.ts';
import { startFresh as startFreshNow } from './fresh.ts';
import { css } from './styles.ts';
import { treeOf } from './tree.ts';
import type { Node } from './tree.ts';
import type { RunningFake, World } from './world.ts';

/*
 * The bubble: a round button over the app in fake mode, dragged anywhere,
 * that opens the Fake World. Drawn in a Shadow DOM of its own, on the
 * page's body, so the app's styles and its own never meet (./styles.ts).
 *
 * 1. Bubble   the button: pressed it opens and closes the panel; dragged,
 *             or moved with Shift and an arrow, it stays where it is left,
 *             kept in localStorage.
 * 2. Panel    every Fake running, each Instance of it from the root down,
 *             a keyed Child by its key: its State's tag, its Model, and a
 *             form per Control its Actor takes (./controls.ts). Start fresh
 *             asks first.
 * 3. Log      every Control sent: when, to which Instance, what, and what
 *             became of it.
 */

/** Where the bubble's place is kept, in localStorage. */
export const PLACE = '@kestack/devtools-kabuki/fake:bubble';
/** The bubble's size, and how far it keeps from the edges, in pixels. */
const SIZE = 44;
const MARGIN = 12;
/** How far a press moves before it is a drag, and a Shift+arrow moves it. */
const DRAG = 4;
const STEP = 24;
/** How many Controls the log keeps, newest first. */
const LOG_SIZE = 200;
/** How many items of one object or list the Model view draws. */
const SHOWN = 100;

/** Over the app, under nothing of its own but a browser's. */
const HOST: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  zIndex: 2147483000,
};

/** One Control sent, as the log shows it. */
export interface Logged {
  readonly at: number;
  readonly fake: string;
  readonly to: string;
  readonly message: string;
  readonly result: Sent;
}

interface Place {
  readonly x: number;
  readonly y: number;
}

// 1. Bubble
const clamped = ({ x, y }: Place): Place => ({
  x: Math.min(Math.max(MARGIN, x), window.innerWidth - SIZE - MARGIN),
  y: Math.min(Math.max(MARGIN, y), window.innerHeight - SIZE - MARGIN),
});

const placeAtFirst = (): Place => {
  try {
    const kept = JSON.parse(localStorage.getItem(PLACE) ?? 'null') as unknown;
    if (
      kept &&
      typeof (kept as Place).x === 'number' &&
      typeof (kept as Place).y === 'number'
    )
      return clamped(kept as Place);
  } catch {
    // Unreadable: the corner.
  }
  return clamped({ x: Infinity, y: Infinity });
};

const keep = (place: Place) => {
  try {
    localStorage.setItem(PLACE, JSON.stringify(place));
  } catch {
    // Storage full or off: it stays only for now.
  }
};

const ARROWS: Readonly<Record<string, Place>> = {
  ArrowLeft: { x: -STEP, y: 0 },
  ArrowRight: { x: STEP, y: 0 },
  ArrowUp: { x: 0, y: -STEP },
  ArrowDown: { x: 0, y: STEP },
};

function Bubble({
  world,
  startFresh,
}: {
  readonly world: World;
  readonly startFresh: () => void;
}) {
  const running = useSyncExternalStore(
    world.subscribe,
    () => world.runtimes,
    () => world.runtimes,
  );
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<ReadonlyArray<Logged>>([]);
  const [place, setPlace] = useState(placeAtFirst);
  const button = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    readonly from: Place;
    readonly start: Place;
    moved: boolean;
  } | null>(null);
  const dragged = useRef(false);

  const move = (next: Place) => {
    const at = clamped(next);
    setPlace(at);
    return at;
  };
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      from: { x: event.clientX - place.x, y: event.clientY - place.y },
      start: { x: event.clientX, y: event.clientY },
      moved: false,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const now = drag.current;
    if (!now) return;
    const far = Math.hypot(
      event.clientX - now.start.x,
      event.clientY - now.start.y,
    );
    if (!now.moved && far < DRAG) return;
    now.moved = true;
    move({ x: event.clientX - now.from.x, y: event.clientY - now.from.y });
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const now = drag.current;
    drag.current = null;
    if (!now?.moved) return;
    dragged.current = true;
    keep(
      move({ x: event.clientX - now.from.x, y: event.clientY - now.from.y }),
    );
  };
  const onClick = () => {
    // A drag ends in a click: it moved the bubble, nothing more.
    if (dragged.current) dragged.current = false;
    else setOpen((was) => !was);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const by = ARROWS[event.key];
    if (!event.shiftKey || !by) return;
    event.preventDefault();
    keep(move({ x: place.x + by.x, y: place.y + by.y }));
  };

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const send = (
    one: RunningFake,
    to: string,
    message: { readonly _tag: string },
  ): Sent => {
    const result = sendTo(one.runtime, to, message);
    setLog((was) =>
      [
        {
          at: Date.now(),
          fake: one.fake.name,
          to,
          message: JSON.stringify(message),
          result,
        },
        ...was,
      ].slice(0, LOG_SIZE),
    );
    return result;
  };
  const freshly = () => {
    if (
      window.confirm(
        'Start fresh? Every Fake, and all this app keeps in this tab, is deleted, and the page reloads.',
      )
    )
      startFresh();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className="bubble"
        style={{ left: place.x, top: place.y }}
        aria-label="Fake world"
        aria-expanded={open}
        title="Fake world: press to open, drag or Shift+arrows to move"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => void (drag.current = null)}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <FlaskConicalIcon size={20} aria-hidden />
      </button>
      {open ? (
        <Panel
          running={running}
          log={log}
          side={place.x + SIZE / 2 > window.innerWidth / 2 ? 'right' : 'left'}
          onSend={send}
          onStartFresh={freshly}
          onClose={close}
        />
      ) : null}
    </>
  );
}

// 2. Panel
/** The panel the bubble opens: every Fake running, and the log. */
export function Panel({
  running,
  log,
  side,
  onSend,
  onStartFresh,
  onClose,
}: {
  readonly running: ReadonlyArray<RunningFake>;
  readonly log: ReadonlyArray<Logged>;
  readonly side: 'left' | 'right';
  readonly onSend: (
    fake: RunningFake,
    to: string,
    message: { readonly _tag: string },
  ) => Sent;
  readonly onStartFresh: () => void;
  readonly onClose: () => void;
}) {
  const title = useId();
  return (
    <div
      className="panel"
      role="dialog"
      aria-labelledby={title}
      data-side={side}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="head">
        <h2 id={title}>Fake world</h2>
        <button type="button" className="button danger" onClick={onStartFresh}>
          Start fresh
        </button>
        <button
          type="button"
          className="button"
          aria-label="Close"
          onClick={onClose}
        >
          <XIcon size={14} aria-hidden />
        </button>
      </div>
      <div className="body">
        {running.length === 0 ? (
          <p className="empty">No Fake is running yet.</p>
        ) : (
          running.map((one) => (
            <FakeSection key={one.fake.name} running={one} onSend={onSend} />
          ))
        )}
        <section className="fake" aria-label="Controls sent">
          <h3>Controls sent</h3>
          <Log log={log} />
        </section>
      </div>
    </div>
  );
}

function FakeSection({
  running,
  onSend,
}: {
  readonly running: RunningFake;
  readonly onSend: (
    fake: RunningFake,
    to: string,
    message: { readonly _tag: string },
  ) => Sent;
}) {
  const { runtime } = running;
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.snapshot,
    () => runtime.snapshot,
  );
  return (
    <section className="fake" aria-label={running.fake.name}>
      <h3>{running.fake.name}</h3>
      <Instance
        node={treeOf(running.fake, snapshot)}
        open
        onSend={(to, message) => onSend(running, to, message)}
      />
    </section>
  );
}

function Instance({
  node,
  open = false,
  onSend,
}: {
  readonly node: Node;
  readonly open?: boolean;
  readonly onSend: (to: string, message: { readonly _tag: string }) => Sent;
}) {
  return (
    <details className="instance" open={open}>
      <summary title={node.address}>
        {node.actor}
        {node.key === undefined ? null : (
          <span className="key"> {node.key}</span>
        )}
        {node.slot === undefined ? null : (
          <span className="slot"> in {node.slot}</span>
        )}
        <span className="tag" title="State">
          {node.tag}
        </span>
      </summary>
      <div className="label">Model</div>
      <div className="json">
        <Json value={node.model} open />
      </div>
      {node.controls.length === 0 ? null : (
        <>
          <div className="label">Controls</div>
          {node.controls.map((control) => (
            <ControlForm
              key={control.tag}
              control={control}
              onSend={(message) => onSend(node.address, message)}
            />
          ))}
        </>
      )}
      {node.children.map((child) => (
        <Instance key={child.address} node={child} onSend={onSend} />
      ))}
    </details>
  );
}

/** A Model as a tree to fold: objects and lists open one level at first. */
function Json({
  value,
  open = false,
}: {
  readonly value: unknown;
  readonly open?: boolean;
}): ReactNode {
  if (value === null || typeof value !== 'object')
    return (
      <span className={value === null ? 'null' : typeof value}>
        {value === undefined ? 'undefined' : JSON.stringify(value)}
      </span>
    );
  const many = Array.isArray(value);
  const entries: ReadonlyArray<readonly [string, unknown]> = many
    ? value.map((one, index) => [String(index), one] as const)
    : Object.entries(value);
  if (entries.length === 0) return <span>{many ? '[]' : '{}'}</span>;
  return (
    <details open={open}>
      <summary>{many ? `[${entries.length}]` : `{${entries.length}}`}</summary>
      <ul>
        {entries.slice(0, SHOWN).map(([key, one]) => (
          <li key={key}>
            <span className="k">{key}: </span>
            <Json value={one} />
          </li>
        ))}
        {entries.length > SHOWN ? (
          <li className="note">… {entries.length - SHOWN} more</li>
        ) : null}
      </ul>
    </details>
  );
}

const optionText = (option: string | number | boolean) =>
  typeof option === 'string' ? option : JSON.stringify(option);

function Field({
  field,
  id,
}: {
  readonly field: FormField;
  readonly id: string;
}) {
  const blank = field.optional
    ? ' (optional)'
    : field.nullable
      ? ' (blank for none)'
      : '';
  const label = (
    <label htmlFor={id} title={field.description}>
      {field.name}
      <span className="note">{blank}</span>
    </label>
  );
  const { input } = field;
  if (input.kind === 'boolean' && !field.optional && !field.nullable)
    return (
      <div className="field check">
        <input id={id} name={field.name} type="checkbox" />
        {label}
      </div>
    );
  return (
    <div className="field">
      {label}
      {input.kind === 'boolean' || input.kind === 'choice' ? (
        <select id={id} name={field.name}>
          {field.optional || field.nullable ? <option value="" /> : null}
          {input.kind === 'boolean' ? (
            <>
              <option value="true">true</option>
              <option value="false">false</option>
            </>
          ) : (
            input.options.map((option, index) => (
              <option key={index} value={index}>
                {optionText(option)}
              </option>
            ))
          )}
        </select>
      ) : input.kind === 'json' ? (
        <textarea id={id} name={field.name} placeholder="JSON" />
      ) : (
        <input
          id={id}
          name={field.name}
          type={input.kind === 'number' ? 'number' : 'text'}
          step={input.kind === 'number' ? 'any' : undefined}
        />
      )}
    </div>
  );
}

function ControlForm({
  control,
  onSend,
}: {
  readonly control: Control;
  readonly onSend: (message: { readonly _tag: string }) => Sent;
}) {
  const id = useId();
  const [said, setSaid] = useState<{
    readonly kind: Sent | 'error';
    readonly text: string;
  } | null>(null);
  const fields = fieldsOf(control.schema);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const filled: Record<string, string | boolean> = {};
    for (const field of fields) {
      const element = form.elements.namedItem(field.name);
      if (element instanceof HTMLInputElement && element.type === 'checkbox')
        filled[field.name] = element.checked;
      else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
        filled[field.name] = element.value;
    }
    const made = messageOf(control, filled);
    if (!made.ok) return setSaid({ kind: 'error', text: made.error });
    const sent = onSend(made.message);
    setSaid({ kind: sent, text: sent });
  };
  return (
    <details className="control">
      <summary>{wordsOf(control.tag)}</summary>
      <form onSubmit={submit} aria-label={wordsOf(control.tag)}>
        {fields.map((field) => (
          <Field key={field.name} field={field} id={`${id}-${field.name}`} />
        ))}
        <div className="actions">
          <button type="submit" className="button primary">
            Send
          </button>
          {said ? (
            <span className={`result ${said.kind}`} role="status">
              {said.text}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}

// 3. Log
const timeOf = (at: number) => new Date(at).toLocaleTimeString();

function Log({ log }: { readonly log: ReadonlyArray<Logged> }) {
  if (log.length === 0) return <p className="empty">Nothing sent yet.</p>;
  return (
    <ul className="log">
      {log.map((one, index) => (
        <li key={log.length - index}>
          <span>
            <span className="when">{timeOf(one.at)}</span> {one.fake}{' '}
            <code>{one.to}</code>{' '}
            <span className={`result ${one.result}`}>{one.result}</span>
          </span>
          <code>{one.message}</code>
        </li>
      ))}
    </ul>
  );
}

/**
 * The bubble over the app, for a Fake World: every Fake's Instances, their
 * Models and Controls, and Start fresh. Render it once, anywhere: it draws
 * itself on the page's body, in a Shadow DOM of its own.
 */
export function FakeBubble({
  world,
  startFresh = startFreshNow,
}: {
  /** The running world, as `FakeWorld.make` gives it. */
  readonly world: World;
  /** What Start fresh does once confirmed: `FakeWorld.startFresh` by default. */
  readonly startFresh?: () => void;
}) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const host = useCallback((node: HTMLElement | null) => {
    if (node) setShadow(node.shadowRoot ?? node.attachShadow({ mode: 'open' }));
  }, []);
  return createPortal(
    createElement(
      'kestack-fake-bubble',
      { ref: host, style: HOST },
      shadow
        ? createPortal(
            <div className="root">
              <style>{css}</style>
              <Bubble world={world} startFresh={startFresh} />
            </div>,
            shadow,
          )
        : null,
    ),
    document.body,
  );
}
