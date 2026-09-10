import { describe, expect, it } from 'vite-plus/test';
import {
  extractStateDetails,
  readableLabel,
  toReadableNode,
} from '../src/client/features/store-console/state-view/readable-state.ts';

describe('readable state transformation', () => {
  it('turns implementation keys into readable labels', () => {
    expect(readableLabel('providerMode')).toBe('Provider Mode');
    expect(readableLabel('api_endpoint')).toBe('Api endpoint');
  });

  it('uses tables only for shallow homogeneous object arrays', () => {
    expect(
      toReadableNode([
        { name: 'one', enabled: true },
        { name: 'two', enabled: false },
      ]),
    ).toMatchObject({
      kind: 'table',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'enabled', label: 'Enabled' },
      ],
    });
    expect(
      toReadableNode([{ name: 'one', nested: { ok: true } }]),
    ).toMatchObject({ kind: 'list' });
  });

  it('separates resource properties and attributes from useful metadata', () => {
    const details = extractStateDetails({
      logicalId: 'Bucket',
      instanceId: 'instance',
      providerMode: 'live',
      providerVersion: 1,
      removalPolicy: 'retain',
      props: { name: 'uploads' },
      attr: { url: 'https://example.com' },
    });
    expect(details.kind).toBe('resource');
    expect(details.metadata.map(({ label }) => label)).toEqual([
      'Logical ID',
      'Instance ID',
      'Provider mode',
      'Provider version',
      'Removal policy',
    ]);
    expect(details.sections.map(({ title }) => title)).toEqual([
      'Properties',
      'Attributes',
    ]);
  });

  it('separates action input and output', () => {
    const details = extractStateDetails({
      kind: 'action',
      logicalId: 'Deploy',
      inputHash: 'abc',
      input: { version: 2 },
      output: { deployed: true },
    });
    expect(details.kind).toBe('action');
    expect(details.sections.map(({ title }) => title)).toEqual([
      'Input',
      'Output',
    ]);
  });
});
