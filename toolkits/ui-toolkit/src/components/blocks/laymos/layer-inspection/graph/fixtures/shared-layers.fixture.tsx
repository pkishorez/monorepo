import { useFixtureInput } from 'react-cosmos/client';

import { FixtureFrame } from '../../fixtures/fixture-frame';
import { LayerGraph } from '../index';

// Modelled on std-toolkit: two storage subsystems and a sync subsystem, all
// leaning on one contract Layer that only one of them hosts.
const layers = [
  'dynamodb.client',
  'dynamodb.store',
  'sqlite.driver',
  'sqlite.store',
  'sync.engine',
  'sync.queue',
  'table.contract',
  'table.key',
].map((id) => ({ id, scopes: [] }));

const layerGraphs = [
  {
    id: 'table',
    description: 'The contract every store is written against.',
    rules: [{ fromLayerId: 'table.key', toLayerIds: ['table.contract'] }],
  },
  {
    id: 'dynamodb',
    description: 'DynamoDB storage.',
    rules: [
      { fromLayerId: 'dynamodb.store', toLayerIds: ['dynamodb.client'] },
      { fromLayerId: 'dynamodb.store', toLayerIds: ['table.contract'] },
      { fromLayerId: 'dynamodb.client', toLayerIds: ['table.key'] },
    ],
  },
  {
    id: 'sqlite',
    description: 'SQLite storage.',
    rules: [
      { fromLayerId: 'sqlite.store', toLayerIds: ['sqlite.driver'] },
      { fromLayerId: 'sqlite.store', toLayerIds: ['table.contract'] },
    ],
  },
  {
    id: 'sync',
    description: 'Replication across stores.',
    rules: [
      { fromLayerId: 'sync.engine', toLayerIds: ['sync.queue'] },
      { fromLayerId: 'sync.engine', toLayerIds: ['table.contract'] },
    ],
  },
];

const rules = layerGraphs.flatMap((graph) => graph.rules);

function LayerReferences() {
  const [activeLayerId, setActiveLayerId] = useFixtureInput<string | null>(
    'active layer',
    null,
  );
  const [activeGraphId, setActiveGraphId] = useFixtureInput<string | null>(
    'selected LayerGraph',
    null,
  );
  const [isolate] = useFixtureInput('isolate LayerGraph', false);

  return (
    <FixtureFrame className="h-[620px]">
      <p className="mb-3 text-xs text-muted-foreground">
        <code>table.contract</code> is hosted by <code>table</code> and reached
        by three other LayerGraphs, whose Rules cross the canvas to it as dashed
        lines. It is drawn once, in one place.
      </p>
      <LayerGraph
        className="h-[540px]"
        layers={layers}
        rules={rules}
        layerGraphs={layerGraphs}
        activeLayerGraphId={activeGraphId ?? undefined}
        isolatedLayerGraphId={
          isolate && activeGraphId !== null ? activeGraphId : undefined
        }
        onLayerGraphActivate={(graphId) =>
          setActiveGraphId((current) => (current === graphId ? null : graphId))
        }
        activeLayerId={activeLayerId ?? undefined}
        onLayerActivate={(layerId) =>
          setActiveLayerId((current) => (current === layerId ? null : layerId))
        }
        onClearFocus={() => setActiveLayerId(null)}
      />
    </FixtureFrame>
  );
}

export default <LayerReferences />;
