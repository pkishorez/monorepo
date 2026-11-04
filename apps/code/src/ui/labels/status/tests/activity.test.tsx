// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activityOf } from '../activity.tsx';
import { StatusWord } from '../word.tsx';

/*
 * Running and In the Background, said apart: a turning circle only while
 * the Turn runs, a dot pulsing softly while only Background Jobs do.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('activityOf', () => {
  it('is Running while the Turn runs, jobs or not', () => {
    expect(activityOf('running', false)).toBe('running');
    expect(activityOf('running', true)).toBe('running');
  });

  it('is In the Background once the Turn has ended, while jobs run', () => {
    expect(activityOf('idle', true)).toBe('background');
    expect(activityOf('cancelled', true)).toBe('background');
    expect(activityOf(undefined, true)).toBe('background');
  });

  it('is idle with neither', () => {
    expect(activityOf('idle', false)).toBe('idle');
    expect(activityOf(undefined, false)).toBe('idle');
  });
});

describe('StatusWord', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const draw = (props: Partial<ComponentProps<typeof StatusWord>>) =>
    act(() =>
      root.render(
        <StatusWord status="idle" unseen={false} at={0} {...props} />,
      ),
    );

  it('turns only while the Turn runs', () => {
    draw({ status: 'running', jobs: true });
    expect(host.textContent).toBe('Running');
    expect(host.querySelector('.animate-spin')).not.toBeNull();
    expect(host.querySelector('.animate-pulse')).toBeNull();
  });

  it('pulses a dot, never turning, while only its jobs run', () => {
    draw({ status: 'idle', jobs: true });
    expect(host.textContent).toBe('Working in the background');
    expect(host.firstElementChild?.getAttribute('title')).toBe(
      'Working in the background',
    );
    expect(host.querySelector('.animate-pulse')).not.toBeNull();
    expect(host.querySelector('.animate-spin')).toBeNull();
  });

  it('asks louder than either', () => {
    draw({ status: 'running', jobs: true, asking: true });
    expect(host.textContent).toBe('Question');
  });
});
