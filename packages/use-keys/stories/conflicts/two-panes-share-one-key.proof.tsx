import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 860px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .panes { display: flex; gap: 16px; }
  section { flex: 1; padding: 14px; background: #fff; border: 2px solid #e4e4e7; border-radius: 16px; cursor: pointer; opacity: 0.55; }
  section.active { border-color: #2563eb; opacity: 1; box-shadow: 0 10px 30px rgba(37,99,235,0.15); }
  h2 { margin: 0 0 8px 8px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 10px 14px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const panes = {
  mail: [
    'Quarterly report',
    'Lunch on Friday?',
    'Design review',
    'Invoice #2041',
  ],
  calendar: ['09:00 Standup', '11:30 Dentist', '14:00 Planning', '17:00 Gym'],
} as const;

function Pane(props: {
  readonly name: keyof typeof panes;
  readonly active: boolean;
  readonly onActivate: () => void;
}) {
  const items = panes[props.name];
  const [at, setAt] = useState(0);
  useShortcut('j', () => setAt((now) => Math.min(items.length - 1, now + 1)), {
    enabled: props.active,
  });
  return (
    <section
      className={props.active ? 'active' : ''}
      onClick={props.onActivate}
      id={props.name}
    >
      <h2>{props.name}</h2>
      <ul>
        {items.map((item, index) => (
          <li key={item} aria-current={index === at}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function App() {
  const [active, setActive] = useState<keyof typeof panes>('mail');
  return (
    <KeysProvider>
      <style>{css}</style>
      <main>
        <h1>Today</h1>
        <p>
          Both panes use <kbd>j</kbd>. Only the pane you clicked last hears it.
        </p>
        <div className="panes">
          <Pane
            name="mail"
            active={active === 'mail'}
            onActivate={() => setActive('mail')}
          />
          <Pane
            name="calendar"
            active={active === 'calendar'}
            onActivate={() => setActive('calendar')}
          />
        </div>
      </main>
    </KeysProvider>
  );
}

export default Proof.browser({
  title: 'Two panes share j, and only the one that is turned on moves',
  description:
    'Each pane enables its `j` only while it is the active pane, kept in app state. Two Enabled `j` would Conflict; this way one key serves both.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(<App />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the mail pane is active',
        (yield* tab.count('#mail.active')) === 1,
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      const read = Effect.all({
        mail: tab.text('#mail [aria-current="true"]'),
        calendar: tab.text('#calendar [aria-current="true"]'),
      });
      yield* tab.press('Press j in mail', 'j');
      const inMail = yield* read;
      yield* tab.click('Click the calendar', '#calendar h2');
      yield* tab.press('Press j twice in the calendar', 'j', 'j');
      return { inMail, inCalendar: yield* read };
    }),
  verify: ({ inMail, inCalendar }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'j moved only the mail pane',
        inMail.mail === 'Lunch on Friday?' &&
          inMail.calendar === '09:00 Standup',
      );
      yield* Proof.assert(
        'after clicking the calendar, j moved only the calendar',
        inCalendar.calendar === '14:00 Planning' &&
          inCalendar.mail === 'Lunch on Friday?',
      );
    }),
});
