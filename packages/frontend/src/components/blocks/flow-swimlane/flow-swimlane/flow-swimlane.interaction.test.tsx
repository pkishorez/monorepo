// @vitest-environment jsdom

import { act, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecordedFlow } from '../flow-presentation';
import { FlowSwimlane, getFlowSummaryIds } from './flow-swimlane';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type RecordedFlowItem = RecordedFlow['items'][number];

const localEvent = (
  id: string,
  participantName: string,
  name: string,
  timestamp: number,
): RecordedFlowItem => ({
  id,
  kind: 'local-event',
  name,
  participantName,
  severity: 'info',
  timestamp,
});

const flowOf = (items: RecordedFlow['items']): RecordedFlow => ({
  id: 'interactive-flow',
  latestTimestamp: items.at(-1)?.timestamp ?? 0,
  items,
  activations: [],
  warnings: [],
});

function Harness({
  flow,
  scrollSelectionIntoView,
}: {
  readonly flow: RecordedFlow;
  readonly scrollSelectionIntoView: boolean;
}) {
  const [selected, setSelected] = useState<RecordedFlowItem | null>(null);
  const summaryIds = useMemo(() => getFlowSummaryIds(flow), [flow]);
  const [collapsedSummaryIds, setCollapsedSummaryIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const allSummariesCollapsed =
    summaryIds.size > 0 &&
    [...summaryIds].every((summaryId) => collapsedSummaryIds.has(summaryId));
  return (
    <>
      <output data-selected-id={selected?.id ?? ''} />
      <aside data-details-panel>
        <button
          type="button"
          onClick={() =>
            setCollapsedSummaryIds(
              allSummariesCollapsed ? new Set() : summaryIds,
            )
          }
        >
          {allSummariesCollapsed ? 'Expand all' : 'Collapse all'}
        </button>
      </aside>
      <FlowSwimlane
        flow={flow}
        collapsedSummaryIds={collapsedSummaryIds}
        onCollapsedSummaryIdsChange={setCollapsedSummaryIds}
        selectedItemId={selected?.id ?? null}
        onSelectionChange={setSelected}
        scrollSelectionIntoView={scrollSelectionIntoView}
      />
    </>
  );
}

describe('FlowSwimlane interactions', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (flow: RecordedFlow, scrollSelectionIntoView = true) => {
    act(() =>
      root.render(
        <Harness
          flow={flow}
          scrollSelectionIntoView={scrollSelectionIntoView}
        />,
      ),
    );
    const viewport = host.querySelector<HTMLElement>('[data-flow-id]')!;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 400 },
      clientWidth: { configurable: true, value: 500 },
    });
    const header = viewport.querySelector<HTMLElement>('[data-flow-header]')!;
    Object.defineProperty(header, 'offsetHeight', {
      configurable: true,
      value: 100,
    });
    viewport.scrollTo = vi.fn();
    return viewport;
  };

  const key = (target: Element, value: string) => {
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: value }),
      );
    });
  };

  it('navigates visible steps, scrolls smoothly, and shares one focus indicator', () => {
    const viewport = render(
      flowOf([
        localEvent('first', 'browser/tab/reader', 'First', 1),
        localEvent('second', 'backend', 'Second', 2),
      ]),
    );

    expect(
      viewport.querySelector(
        '[data-flow-participant-highlight][data-active="true"]',
      ),
    ).toBeNull();
    key(viewport, 'j');
    expect(host.querySelector('output')?.getAttribute('data-selected-id')).toBe(
      'first',
    );
    expect(host.querySelectorAll('[data-flow-focus-indicator]')).toHaveLength(
      1,
    );
    expect(
      viewport
        .querySelector('[data-active-participant="true"]')
        ?.getAttribute('data-participant-path'),
    ).toBe('browser/tab/reader');
    expect(
      viewport.querySelectorAll('[data-active-participant-path="true"]'),
    ).toHaveLength(3);
    expect(
      viewport.querySelectorAll('[data-active-participant-section="true"]'),
    ).toHaveLength(3);
    expect(
      host
        .querySelector('[data-flow-item][data-selected="true"]')
        ?.querySelector('rect[stroke="var(--color-primary)"]'),
    ).toBeNull();
    expect(viewport.scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    );

    key(viewport, 'ArrowDown');
    expect(host.querySelector('output')?.getAttribute('data-selected-id')).toBe(
      'second',
    );
    expect(host.querySelectorAll('[data-flow-focus-indicator]')).toHaveLength(
      1,
    );
    expect(
      viewport
        .querySelector('[data-active-participant="true"]')
        ?.getAttribute('data-participant-path'),
    ).toBe('backend');
    expect(
      viewport.querySelectorAll('[data-active-participant-path="true"]'),
    ).toHaveLength(1);
    expect(
      viewport.querySelectorAll('[data-active-participant-section="true"]'),
    ).toHaveLength(1);

    const scrollCalls = vi.mocked(viewport.scrollTo).mock.calls.length;
    key(viewport, 'Enter');
    expect(host.querySelector('output')?.getAttribute('data-selected-id')).toBe(
      'second',
    );
    expect(viewport.scrollTo).toHaveBeenCalledTimes(scrollCalls);
  });

  it('lets a focused row handle Enter after another row is selected', () => {
    const viewport = render(
      flowOf([
        localEvent('first', 'browser', 'First', 1),
        localEvent('second', 'backend', 'Second', 2),
      ]),
    );

    key(viewport, 'j');
    const secondRow = viewport.querySelectorAll('[data-flow-item]')[1]!;
    key(secondRow, 'Enter');

    expect(host.querySelector('output')?.getAttribute('data-selected-id')).toBe(
      'second',
    );
  });

  it('reclaims focus from a clicked row when navigating with the keyboard', () => {
    const viewport = render(
      flowOf([
        localEvent('first', 'browser', 'First', 1),
        localEvent('second', 'backend', 'Second', 2),
      ]),
    );

    const firstRow = viewport.querySelector<HTMLElement>('[data-flow-item]')!;
    act(() => firstRow.focus());
    key(viewport, 'j');

    expect(document.activeElement).toBe(viewport);
  });

  it('expands by default, collapses all long runs, and lets Enter toggle one run', () => {
    const viewport = render(
      flowOf([
        localEvent('first', 'replica', 'Read', 1),
        localEvent('second', 'replica', 'Merge', 2),
        localEvent('third', 'replica', 'Write', 3),
        localEvent('fourth', 'backend', 'Done', 4),
      ]),
    );

    expect(viewport.textContent).not.toContain('hidden step');
    expect(
      viewport.querySelectorAll('[data-flow-item="local-event"]'),
    ).toHaveLength(4);
    const collapseAll = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Collapse all',
    )!;
    act(() => collapseAll.click());
    expect(viewport.textContent).toContain('1 hidden step');
    expect(
      viewport.querySelectorAll('[data-flow-item="summary"]'),
    ).toHaveLength(1);

    key(viewport, 'j');
    key(viewport, 'Enter');
    expect(viewport.textContent).not.toContain('hidden step');
    expect(
      viewport.querySelectorAll('[data-flow-item="local-event"]'),
    ).toHaveLength(4);

    key(viewport, 'j');
    expect(host.querySelector('output')?.getAttribute('data-selected-id')).toBe(
      'second',
    );
    key(viewport, 'Enter');
    expect(viewport.textContent).toContain('1 hidden step');
    expect(host.querySelector('output')?.getAttribute('data-selected-id')).toBe(
      'second',
    );
    key(viewport, 'Enter');
    expect(viewport.textContent).not.toContain('hidden step');
    expect(host.querySelector('output')?.getAttribute('data-selected-id')).toBe(
      'second',
    );
  });

  it('toggles a selected consecutive run when Enter comes from its focused row', () => {
    const viewport = render(
      flowOf([
        localEvent('first', 'replica', 'Read', 1),
        localEvent('second', 'replica', 'Merge', 2),
        localEvent('third', 'replica', 'Write', 3),
        localEvent('fourth', 'backend', 'Done', 4),
      ]),
    );

    key(viewport, 'j');
    key(viewport, 'j');
    const scrollCalls = vi.mocked(viewport.scrollTo).mock.calls.length;
    const otherRow = viewport.querySelectorAll('[data-flow-item]')[3]!;
    key(otherRow, 'Enter');
    expect(
      viewport.querySelectorAll('[data-flow-item="summary"]'),
    ).toHaveLength(1);
    expect(host.querySelector('output')?.getAttribute('data-selected-id')).toBe(
      'second',
    );
    expect(viewport.scrollTo).toHaveBeenCalledTimes(scrollCalls + 1);

    key(
      viewport.querySelector('[data-flow-item][data-selected="true"]')!,
      'Enter',
    );
    expect(
      viewport.querySelectorAll('[data-flow-item="summary"]'),
    ).toHaveLength(0);
    expect(
      viewport.querySelectorAll('[data-flow-item="local-event"]'),
    ).toHaveLength(4);
    expect(host.querySelector('output')?.getAttribute('data-selected-id')).toBe(
      'second',
    );
    expect(viewport.scrollTo).toHaveBeenCalledTimes(scrollCalls + 2);
  });

  it('can disable smooth centering for keyboard navigation and summary toggles', () => {
    const viewport = render(
      flowOf([
        localEvent('first', 'replica', 'Read', 1),
        localEvent('second', 'replica', 'Merge', 2),
        localEvent('third', 'replica', 'Write', 3),
      ]),
      false,
    );

    key(viewport, 'j');
    key(viewport, 'Enter');

    expect(
      viewport.querySelectorAll('[data-flow-item="summary"]'),
    ).toHaveLength(1);
    expect(viewport.scrollTo).not.toHaveBeenCalled();
  });

  it('recenters the selection when an external details control toggles all summaries', () => {
    const viewport = render(
      flowOf([
        localEvent('first', 'replica', 'Read', 1),
        localEvent('second', 'replica', 'Merge', 2),
        localEvent('third', 'replica', 'Write', 3),
      ]),
    );

    key(viewport, 'j');
    const scrollCalls = vi.mocked(viewport.scrollTo).mock.calls.length;
    const collapseAll = host.querySelector<HTMLElement>(
      '[data-details-panel] button',
    )!;
    act(() => collapseAll.click());

    expect(
      viewport.querySelectorAll('[data-flow-item="summary"]'),
    ).toHaveLength(1);
    expect(viewport.scrollTo).toHaveBeenCalledTimes(scrollCalls + 1);

    act(() => collapseAll.click());
    expect(
      viewport.querySelectorAll('[data-flow-item="summary"]'),
    ).toHaveLength(0);
    expect(viewport.scrollTo).toHaveBeenCalledTimes(scrollCalls + 2);
  });

  it('keeps the participant grid as the only flow header', () => {
    const viewport = render(
      flowOf([localEvent('first', 'browser/tab/reader', 'Read', 1)]),
    );

    expect(
      viewport.querySelector('[data-participant-path="browser/tab/reader"]'),
    ).not.toBeNull();
    expect(
      viewport.querySelector('[aria-label="Collapse participant header"]'),
    ).toBeNull();
    expect(viewport.textContent).not.toContain('lane');
  });

  it('collapses descendants and hides or restores complete Participant subtrees', () => {
    const viewport = render(
      flowOf([
        localEvent('parent', 'browser', 'Open', 1),
        localEvent('query', 'browser/tab/query', 'Query', 2),
        localEvent('worker', 'browser/tab/worker', 'Work', 3),
      ]),
    );

    const click = (label: string) => {
      const target = viewport.querySelector<HTMLElement>(
        `[aria-label="${label}"]`,
      )!;
      act(() => target.click());
    };

    click('Collapse descendants of browser');
    expect(viewport.textContent).toContain('2 collapsed');
    expect(viewport.querySelectorAll('[data-flow-item]')).toHaveLength(1);

    click('Hide browser and its descendants');
    expect(viewport.textContent).toContain('3 participants hidden');
    expect(viewport.querySelectorAll('[data-flow-item]')).toHaveLength(0);

    click('Restore browser');
    expect(viewport.textContent).toContain('2 collapsed');
    expect(viewport.querySelectorAll('[data-flow-item]')).toHaveLength(1);
  });

  it('hides own activity as one sibling lane without hiding descendants', () => {
    const viewport = render(
      flowOf([
        localEvent('parent', 'browser', 'Open', 1),
        localEvent('query', 'browser/tab/query', 'Query', 2),
        localEvent('worker', 'browser/tab/worker', 'Work', 3),
      ]),
    );
    const click = (label: string) => {
      const target = viewport.querySelector<HTMLElement>(
        `[aria-label="${label}"]`,
      )!;
      act(() => target.click());
    };

    click('Hide browser own activity');
    expect(viewport.textContent).toContain('own hidden');
    expect(viewport.querySelectorAll('[data-flow-item]')).toHaveLength(2);
    click('Restore browser own activity');
    expect(viewport.querySelectorAll('[data-flow-item]')).toHaveLength(3);
  });
});
