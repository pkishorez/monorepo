import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import type { ViewProps } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';
import { RenderCounts, counted } from '../render-count/index.js';
import { Editor, Editors } from './editor.js';

/** Counts each time React mounts an input: a ref callback runs once per mount. */
const mountedInput = (label: string) => (element: HTMLInputElement | null) => {
  if (element) counted(`${label} input mounts`);
};
const keptMounted = mountedInput('kept');
const remountedMounted = mountedInput('remounted');

const status = ({ _tag, state }: ViewProps<typeof Editor>) =>
  _tag === 'Saving'
    ? `Saving since ${Math.round(state.since)} ms`
    : _tag === 'Saved'
      ? 'Saved'
      : 'Editing';

const Form = ({
  self,
  inputRef,
  children,
}: {
  readonly self: ViewProps<typeof Editor>;
  readonly inputRef: (element: HTMLInputElement | null) => void;
  readonly children?: ReactNode;
}) => (
  <form
    className="flex flex-col gap-2"
    onSubmit={(event) => {
      event.preventDefault();
      self.send({ _tag: 'Submitted' });
    }}
  >
    <Input
      ref={inputRef}
      aria-label="Draft"
      value={self.model.draft}
      onChange={(event) =>
        self.send({ _tag: 'Typed', text: event.target.value })
      }
    />
    <Button type="submit" disabled={self._tag !== 'Editing'}>
      Save
    </Button>
    {children}
  </form>
);

/** One draw function: a Transition changes the status, the input stays. */
const KeptView = View.make(Editor, (self) => {
  counted(`kept ${self._tag}`);
  return (
    <Form self={self} inputRef={keptMounted}>
      <p className="text-sm text-muted-foreground">{status(self)}</p>
    </Form>
  );
});

/** What one draw per State did before: a Transition remounts everything. */
const RemountedView = View.make(Editor, (self) => {
  counted(`remounted ${self._tag}`);
  return (
    <div key={self._tag}>
      <Form self={self} inputRef={remountedMounted}>
        <p className="text-sm text-muted-foreground">{status(self)}</p>
      </Form>
    </div>
  );
});

/**
 * Type in either input and press Enter. The left input keeps focus through
 * Saving and Saved; the right one is mounted again on every Transition and
 * loses it.
 */
export const EditorsView = View.make(Editors, ({ children }) => (
  <div className="flex size-full gap-6 overflow-y-auto p-6">
    <section className="flex flex-1 flex-col gap-2">
      <h2 className="font-medium">One draw function</h2>
      <KeptView instance={children.kept} />
    </section>
    <section className="flex flex-1 flex-col gap-2">
      <h2 className="font-medium">Keyed by State</h2>
      <RemountedView instance={children.remounted} />
    </section>
    <RenderCounts />
  </div>
));
