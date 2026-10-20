import { describe, expect, it } from 'vitest';
import type {
  RunEvent,
  RunnerEvent,
} from '../../shared/contracts/run/index.ts';
import { mergeBySeq, phasesOf, resourcesOf } from './resources.ts';

const events = (...each: ReadonlyArray<RunnerEvent>): Array<RunEvent> =>
  each.map((event, index) => ({ runId: 'r', seq: index + 1, at: 0, event }));

const status = (fqn: string, value: string, message: string | null = null) =>
  ({
    _tag: 'ResourceStatus',
    fqn,
    logicalId: fqn,
    resourceType: 'Cloudflare.Worker',
    status: value,
    message,
  }) as const;

const planned = {
  _tag: 'Planned',
  resources: [
    {
      fqn: 'Markers',
      logicalId: 'Markers',
      resourceType: 'KV',
      action: 'create',
    },
    { fqn: 'Worker', logicalId: 'Worker', resourceType: 'W', action: 'create' },
    { fqn: 'Old', logicalId: 'Old', resourceType: 'W', action: 'noop' },
  ],
} as const;

describe('resourcesOf', () => {
  it('is null until the plan is told', () => {
    expect(
      resourcesOf(events({ _tag: 'Phase', phase: 'planning' })),
    ).toBeNull();
  });

  it('starts each planned resource waiting, and one the plan leaves alone unchanged', () => {
    expect(
      resourcesOf(events(planned))!.map(({ logicalId, progress }) => [
        logicalId,
        progress,
      ]),
    ).toEqual([
      ['Markers', 'waiting'],
      ['Worker', 'waiting'],
      ['Old', 'unchanged'],
    ]);
  });

  it('moves each resource to where Alchemy last said it is, keeping its message', () => {
    const rows = resourcesOf(
      events(
        planned,
        status('Old', 'pending'),
        status('Markers', 'creating'),
        status('Worker', 'creating', 'Uploading'),
        status('Markers', 'created'),
        status('Worker', 'fail'),
      ),
    )!;
    expect(
      rows.map(({ logicalId, status, progress, message }) => [
        logicalId,
        status,
        progress,
        message,
      ]),
    ).toEqual([
      ['Markers', 'created', 'done', null],
      ['Worker', 'fail', 'failed', 'Uploading'],
      ['Old', 'pending', 'waiting', null],
    ]);
  });

  it('adds a resource Alchemy reports that the plan never named, at the end', () => {
    const rows = resourcesOf(events(planned, status('Migrate', 'running')))!;
    expect(rows.at(-1)).toMatchObject({
      logicalId: 'Migrate',
      action: 'run',
      progress: 'working',
    });
  });
});

describe('phasesOf', () => {
  it('lists each phase once, in the order begun', () => {
    expect(
      phasesOf(
        events(
          { _tag: 'Phase', phase: 'cloning' },
          { _tag: 'Phase', phase: 'setup' },
          planned,
          { _tag: 'Phase', phase: 'setup' },
          { _tag: 'Phase', phase: 'planning' },
        ),
      ),
    ).toEqual(['cloning', 'setup', 'planning']);
  });
});

describe('mergeBySeq', () => {
  it('keeps each seq once, so steps heard again after a reconnect count once', () => {
    const first = events(
      { _tag: 'Phase', phase: 'cloning' },
      { _tag: 'Phase', phase: 'setup' },
    );
    const again = events(
      { _tag: 'Phase', phase: 'cloning' },
      { _tag: 'Phase', phase: 'setup' },
      { _tag: 'Phase', phase: 'inspecting' },
    );
    expect(mergeBySeq(first, again).map(({ seq }) => seq)).toEqual([1, 2, 3]);
    expect(mergeBySeq(again, first)).toBe(again);
  });
});
