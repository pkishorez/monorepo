// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import type { QuestionItem } from '@kestack/connect/code';
import { afterEach, describe, expect, it } from 'vitest';
import { keys } from '../../../../../../../commands.ts';
import type { Dictated } from '../../../../../../../../voice/index.ts';
import { Step } from '../step.tsx';
import { joined, ownerOf, Taking } from '../voice.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * One's own answer, dictated: each Item that takes one, but a secret, is
 * a field of its own, by its question and Item; its mic, row or field,
 * starts and stops one for it, waits while one goes for another field,
 * and what it said goes after what is typed, once. The Dictation is stood
 * in for: only what the step asks of it is noted.
 */

const ITEM: QuestionItem = {
  id: 'a',
  header: '',
  question: 'Which way should users sign in?',
  options: [{ label: 'Link', description: '' }],
  multiSelect: false,
  other: true,
  secret: false,
};

let asked: Array<string> = [];

const dictated = (over: Partial<Dictated> = {}): Dictated => ({
  availability: { _tag: 'Ready' },
  recording: null,
  pending: null,
  onToggle: () => void asked.push('Toggle'),
  onCancel: () => void asked.push('Cancel'),
  onTook: (id) => void asked.push(`Took ${id}`),
  onRetry: (id) => void asked.push(`Retry ${id}`),
  onShown: () => () => {},
  microphones: () => null,
  onChooseMicrophone: () => {},
  ...over,
});

let root: ReactRoot | undefined;

const draw = async (node: React.ReactNode) => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<keys.Provider>{node}</keys.Provider>));
};

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  asked = [];
  document.body.innerHTML = '';
});

function OwnAnswer({ voice }: { readonly voice: Dictated | null }) {
  const within = useRef<HTMLElement>(null);
  const dictate = useRef<(() => void) | null>(null);
  return (
    <Step
      index={0}
      item={ITEM}
      draft={{ chosen: [], typed: '', other: false }}
      missing={false}
      last
      touch={false}
      editing={false}
      dictated={voice}
      within={within}
      dictate={dictate}
      onEditing={() => {}}
      onChoose={() => {}}
      onChooseOther={() => {}}
      onType={() => {}}
      onNext={() => {}}
      onStep={() => {}}
    />
  );
}

const mic = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe('one’s own answer, dictated', () => {
  it('is a field of its own for each Item, but a secret’s', () => {
    expect(ownerOf('m1', 'q1', ITEM)).toEqual({
      key: 'question m1 q1 a',
      connectionId: 'm1',
    });
    expect(ownerOf('m1', 'q1', { ...ITEM, secret: true })).toBeNull();
    expect(ownerOf('m1', 'q1', { ...ITEM, other: false })).toBeNull();
  });

  it('goes after what is typed, a space between', () => {
    expect(joined('', 'hello')).toBe('hello');
    expect(joined('  ', 'hello')).toBe('hello');
    expect(joined('Magic ', 'words')).toBe('Magic words');
    expect(joined('Magic', 'words')).toBe('Magic words');
  });

  it('has a mic beside its row that starts one, and none with no Dictation', async () => {
    await draw(<OwnAnswer voice={dictated()} />);
    await act(async () => mic('Dictate your answer')!.click());
    expect(asked).toEqual(['Toggle']);
    await act(async () =>
      root!.render(
        <keys.Provider>
          <OwnAnswer voice={null} />
        </keys.Provider>,
      ),
    );
    expect(mic('Dictate your answer')).toBeNull();
  });

  it('waits while one goes for another field, and stops its own', async () => {
    await draw(
      <OwnAnswer voice={dictated({ availability: { _tag: 'Busy' } })} />,
    );
    expect(mic('Recording somewhere else')!.disabled).toBe(true);
    await act(async () =>
      root!.render(
        <keys.Provider>
          <OwnAnswer
            voice={dictated({
              recording: {
                _tag: 'Recording',
                microphone: 'Mic',
                elapsed: <span>0:03</span>,
                level: <span />,
                wave: <span />,
              },
            })}
          />
        </keys.Provider>,
      ),
    );
    expect(document.body.textContent).toContain('0:03');
    await act(async () => mic('Stop the Dictation')!.click());
    expect(asked).toEqual(['Toggle']);
  });

  it('puts what was said after what is typed, once', async () => {
    const typed: Array<string> = [];
    const came = dictated({
      pending: { _tag: 'Text', id: 4, text: 'by passkey' },
    });
    const take = (voice: Dictated) => (
      <Taking
        dictated={voice}
        typed="Sign in"
        held={false}
        onType={(text) => void typed.push(text)}
      />
    );
    await draw(take(came));
    // Drawn again before the Dictation hears it was taken.
    await act(async () =>
      root!.render(<keys.Provider>{take({ ...came })}</keys.Provider>),
    );
    expect(typed).toEqual(['Sign in by passkey']);
    expect(asked).toEqual(['Took 4']);
  });

  it('keeps what was said waiting while the question is being answered', async () => {
    const typed: Array<string> = [];
    const came = dictated({
      pending: { _tag: 'Text', id: 5, text: 'later' },
    });
    const take = (held: boolean) => (
      <keys.Provider>
        <Taking
          dictated={came}
          typed=""
          held={held}
          onType={(text) => void typed.push(text)}
        />
      </keys.Provider>
    );
    await draw(take(true));
    expect(typed).toEqual([]);
    expect(asked).toEqual([]);
    await act(async () => root!.render(take(false)));
    expect(typed).toEqual(['later']);
    expect(asked).toEqual(['Took 5']);
  });

  it('edits on Space, not dictates, while voice is off', async () => {
    let dictate: (() => void) | null = () => {};
    function Off() {
      const within = useRef<HTMLElement>(null);
      const ref = useRef<(() => void) | null>(null);
      dictate = ref.current;
      return (
        <Step
          index={0}
          item={ITEM}
          draft={{ chosen: [], typed: '', other: false }}
          missing={false}
          last
          touch={false}
          editing={false}
          dictated={dictated({
            availability: { _tag: 'Off', reason: 'Turn on Speech to Text' },
          })}
          within={within}
          dictate={ref}
          onEditing={() => {}}
          onChoose={() => {}}
          onChooseOther={() => {}}
          onType={() => {}}
          onNext={() => {}}
          onStep={() => {}}
        />
      );
    }
    await draw(<Off />);
    await act(async () =>
      root!.render(
        <keys.Provider>
          <Off />
        </keys.Provider>,
      ),
    );
    expect(dictate).toBeNull();
    expect(mic('Turn on Speech to Text')!.disabled).toBe(true);
  });
});
