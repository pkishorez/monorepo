import { describe, expect, it } from 'vitest';

import {
  documentReviewMachine,
  mediaPlayerMachine,
  orderMachine,
  releaseMachine,
  trafficLightMachine,
  uploadMachine,
} from '../fixtures/xstate-v5/machines';
import {
  checkoutMachineV6,
  documentReviewMachineV6,
  trafficLightMachineV6,
} from '../fixtures/xstate-v6/machines';
import { containsPoint, layoutStateMachine } from './layout';
import { serializeV5 } from './v5/serialize';
import { serializeV6 } from './v6/serialize';

const FIXTURE_MACHINES = [
  trafficLightMachine,
  orderMachine,
  uploadMachine,
  mediaPlayerMachine,
  documentReviewMachine,
  releaseMachine,
]
  .map(serializeV5)
  .concat(
    [trafficLightMachineV6, checkoutMachineV6, documentReviewMachineV6].map(
      serializeV6,
    ),
  );

describe('state machine layout', () => {
  it('places the initial indicator before the initial state', async () => {
    const machine = serializeV5(orderMachine);
    const layout = await layoutStateMachine(machine);
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));

    expect(
      nodes.get('order-processing.draft:initial-indicator')!.x,
    ).toBeLessThan(nodes.get('order-processing.draft')!.x);
    expect(layout.edges).toContainEqual(
      expect.objectContaining({
        id: 'order-processing.draft:initial-transition',
        source: 'order-processing.draft:initial-indicator',
        target: 'order-processing.draft',
      }),
    );
  });

  it('returns renderer-neutral scene primitives', async () => {
    const machine = serializeV5(orderMachine);
    const layout = await layoutStateMachine(machine);

    expect(layout).toMatchObject({
      id: 'order-processing',
      label: 'Order Processing',
    });
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(layout.nodes.find((node) => node.kind === 'initial')).toBeDefined();
    expect(layout.nodes.every((node) => 'position' in node === false)).toBe(
      true,
    );
    expect(layout.edges.every((edge) => 'markerEnd' in edge === false)).toBe(
      true,
    );
  });

  it('keeps ordinary transitions compact without crowding states', async () => {
    const machine = serializeV5(trafficLightMachine);
    const layout = await layoutStateMachine(machine);
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const red = nodes.get('traffic-light.red')!;
    const green = nodes.get('traffic-light.green')!;
    const gap = green.x - (red.x + red.width);

    expect(gap).toBeGreaterThanOrEqual(120);
    expect(gap).toBeLessThanOrEqual(320);
  });

  it('leaves room around transition labels between adjacent states', async () => {
    const machine = serializeV5(orderMachine);
    const layout = await layoutStateMachine(machine, {
      aspectRatio: 1.65,
      wrappingStrategy: 'SINGLE_EDGE',
    });
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const validating = nodes.get('order-processing.validating')!;
    const charging = nodes.get('order-processing.charging')!;
    const gap = charging.x - (validating.x + validating.width);

    expect(gap).toBeGreaterThanOrEqual(120);
  });

  it('leaves room around transition labels inside compound states', async () => {
    const machine = serializeV5(mediaPlayerMachine);
    const layout = await layoutStateMachine(machine, {
      aspectRatio: 1.65,
      wrappingStrategy: 'SINGLE_EDGE',
    });
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const ready = nodes.get('media-player.on.ready')!;
    const playing = nodes.get('media-player.on.playing')!;
    const gap = playing.x - (ready.x + ready.width);

    expect(gap).toBeGreaterThanOrEqual(120);
  });

  it('embeds transition labels directly on their routed edges', async () => {
    const machine = serializeV5(trafficLightMachine);
    const layout = await layoutStateMachine(machine);
    const labeledEdges = layout.edges.filter((edge) => edge.label);

    expect(labeledEdges).not.toHaveLength(0);

    for (const edge of labeledEdges) {
      const { sections, labelX, labelY } = edge;

      expect(labelX).toBeDefined();
      expect(labelY).toBeDefined();
      expect(
        sections.some((section) =>
          section.points.slice(1).some((end, index) => {
            const start = section.points[index];
            const crossProduct =
              (labelX! - start.x) * (end.y - start.y) -
              (labelY! - start.y) * (end.x - start.x);
            const withinX =
              labelX! >= Math.min(start.x, end.x) &&
              labelX! <= Math.max(start.x, end.x);
            const withinY =
              labelY! >= Math.min(start.y, end.y) &&
              labelY! <= Math.max(start.y, end.y);

            return Math.abs(crossProduct) < 0.001 && withinX && withinY;
          }),
        ),
      ).toBe(true);
    }
  });

  it('supports opt-in aspect ratio and graph wrapping options', async () => {
    const machine = serializeV5(orderMachine);
    const [defaultLayout, compactLayout, singleEdgeLayout] = await Promise.all([
      layoutStateMachine(machine),
      layoutStateMachine(machine, {
        aspectRatio: 1,
        wrappingStrategy: 'MULTI_EDGE',
      }),
      layoutStateMachine(machine, {
        aspectRatio: 1,
        wrappingStrategy: 'SINGLE_EDGE',
      }),
    ]);

    expect(compactLayout.width / compactLayout.height).toBeLessThan(
      defaultLayout.width / defaultLayout.height,
    );
    expect(singleEdgeLayout.nodes).toHaveLength(defaultLayout.nodes.length);
    expect(singleEdgeLayout.edges).toHaveLength(defaultLayout.edges.length);
    expect(
      compactLayout.edges.every(
        (edge) =>
          edge.sections.filter((section) => section.target).length === 1,
      ),
    ).toBe(true);
    const compactNodes = new Map(
      compactLayout.nodes.map((node) => [node.id, node]),
    );
    expect(
      compactLayout.edges.every((edge) =>
        containsPoint(
          compactNodes.get(edge.target)!,
          edge.sections.find((section) => section.target)!.points.at(-1)!,
        ),
      ),
    ).toBe(true);
  });

  it('rejects invalid aspect ratios', async () => {
    const machine = serializeV5(orderMachine);

    await expect(
      layoutStateMachine(machine, { aspectRatio: 0 }),
    ).rejects.toThrow('greater than zero');
  });

  it.each(FIXTURE_MACHINES)(
    'routes every fixture edge through ELK',
    async (machine) => {
      const layout = await layoutStateMachine(machine);

      expect(layout.nodes.length).toBeGreaterThanOrEqual(machine.nodes.length);
      expect(layout.edges).toHaveLength(
        machine.edges.length +
          machine.nodes.filter((node) => node.initial).length,
      );
      expect(
        layout.edges.every(
          (edge) =>
            edge.sections.length > 0 &&
            edge.sections.every((section) => section.points.length >= 2),
        ),
      ).toBe(true);
    },
  );

  it.each(FIXTURE_MACHINES)(
    'supports every wrapping strategy for every fixture',
    async (machine) => {
      await expect(
        Promise.all(
          (['OFF', 'SINGLE_EDGE', 'MULTI_EDGE'] as const).map(
            (wrappingStrategy) =>
              layoutStateMachine(machine, {
                aspectRatio: 1,
                wrappingStrategy,
              }),
          ),
        ),
      ).resolves.toHaveLength(3);
    },
  );
});
