import { useFixtureInput } from 'react-cosmos/client';
import type { LaymosReport } from 'laymos/report';

import {
  complexLayersFixtureReport,
  laymosLayersFixtureReport,
  siblingLayersFixtureReport,
} from './reports';
import { LaymosLayers } from '../components/laymos-layers';
import type { LaymosNode } from '../types';

function Controlled({
  report = laymosLayersFixtureReport,
  initialSelected = null,
  initialHovered = null,
  initialFocused = null,
}: {
  report?: LaymosReport;
  initialSelected?: LaymosNode | null;
  initialHovered?: LaymosNode | null;
  initialFocused?: LaymosNode | null;
}) {
  const [selectedNode, setSelectedNode] = useFixtureInput<LaymosNode | null>(
    'selected node',
    initialSelected,
  );
  const [hoveredNode, setHoveredNode] = useFixtureInput<LaymosNode | null>(
    'hovered node',
    initialHovered,
  );
  const [focusedNode, setFocusedNode] = useFixtureInput<LaymosNode | null>(
    'focused node',
    initialFocused,
  );
  return (
    <div className="h-[860px] w-full min-w-[960px]">
      <LaymosLayers
        report={report}
        selectedNode={selectedNode}
        onSelectedNodeChange={setSelectedNode}
        hoveredNode={hoveredNode}
        onHoveredNodeChange={setHoveredNode}
        focusedNode={focusedNode}
        onFocusedNodeChange={setFocusedNode}
        defaultMinimise
      />
    </div>
  );
}

export default {
  overview: <Controlled />,
  'active graph': (
    <Controlled initialSelected={{ kind: 'graph', name: 'web' }} />
  ),
  'active layer': (
    <Controlled initialSelected={{ kind: 'layer', name: 'routes' }} />
  ),
  'hover preview': (
    <Controlled initialHovered={{ kind: 'layer', name: 'domain' }} />
  ),
  'keyboard focus preview': (
    <Controlled initialFocused={{ kind: 'layer', name: 'services' }} />
  ),
  'sibling-heavy architecture': (
    <Controlled
      report={siblingLayersFixtureReport}
      initialSelected={{ kind: 'layer', name: 'entry' }}
    />
  ),
  'complex shared architecture': (
    <Controlled
      report={complexLayersFixtureReport}
      initialSelected={{ kind: 'layer', name: 'application' }}
    />
  ),
  'complex violation interaction': (
    <Controlled
      report={complexLayersFixtureReport}
      initialSelected={{ kind: 'layer', name: 'screens' }}
    />
  ),
};
