import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';

import type { VizSummary } from '../types';
import { buildFeatureTree } from './feature-graph-data';
import type { FeatureNodeData } from './feature-layout';
import { computeFeatureLayout } from './feature-layout';
import { featureNodeTypes } from './feature-node-types';
import { FIT_VIEW_OPTIONS } from './react-flow-options';

type FeatureGraph = NonNullable<VizSummary['featureGraphs']>[number];

type FeatureGraphPanelProps = {
  featureGraph: FeatureGraph;
  onHoverFiles: (files: string[] | null) => void;
};

export function FeatureGraphPanel(props: FeatureGraphPanelProps) {
  return (
    <ReactFlowProvider>
      <FeatureGraphPanelInner {...props} />
    </ReactFlowProvider>
  );
}

function FeatureGraphPanelInner({
  featureGraph,
  onHoverFiles,
}: FeatureGraphPanelProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [deepExpandedFolders, setDeepExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const { fitView, getViewport, setViewport } = useReactFlow();
  const centeredFeatureRef = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{
    nodeId: string;
    screenX: number;
    screenY: number;
  } | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let skip = true;
    const observer = new ResizeObserver(() => {
      if (skip) {
        skip = false;
        return;
      }
      requestAnimationFrame(() => fitView(FIT_VIEW_OPTIONS));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitView]);

  useEffect(() => {
    if (centeredFeatureRef.current === featureGraph.feature) return;
    setExpandedFolders(new Set());
    setDeepExpandedFolders(new Set());
    setHoveredNode(null);
    onHoverFiles(null);
  }, [featureGraph.feature, onHoverFiles]);

  const tree = useMemo(
    () => buildFeatureTree(featureGraph, expandedFolders, deepExpandedFolders),
    [featureGraph, expandedFolders, deepExpandedFolders],
  );

  const { nodes, edges } = useMemo(
    () => computeFeatureLayout(tree, hoveredNode),
    [tree, hoveredNode],
  );

  const handleInit = useCallback(
    (_instance: ReactFlowInstance) => {
      centeredFeatureRef.current = featureGraph.feature;
    },
    [featureGraph.feature],
  );

  useEffect(() => {
    if (
      centeredFeatureRef.current === null ||
      centeredFeatureRef.current === featureGraph.feature
    )
      return;
    centeredFeatureRef.current = featureGraph.feature;

    const seedIds = nodes
      .filter((n) => (n.data as FeatureNodeData).kind === 'seed')
      .map((n) => ({ id: n.id }));

    requestAnimationFrame(() => {
      fitView({
        padding: 0.3,
        duration: 300,
        nodes: seedIds.length > 0 ? seedIds : undefined,
      });
    });
  }, [featureGraph.feature, fitView, nodes]);

  const treeNodeMap = useMemo(() => {
    const map = new Map<
      string,
      { file: string; kind: string; files?: string[] }
    >();
    function walk(node: import('./feature-graph-data').TreeNode) {
      map.set(node.id, { file: node.file, kind: node.kind, files: node.files });
      for (const child of node.children) walk(child);
    }
    for (const root of tree.roots) walk(root);
    return map;
  }, [tree]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null;

    const node = nodes.find((n) => n.id === anchor.nodeId);
    if (!node) return;

    const vp = getViewport();
    const newCenterX = node.position.x + (node.width ?? 0) / 2;
    const newCenterY = node.position.y + (node.height ?? 0) / 2;
    setViewport({
      x: anchor.screenX - newCenterX * vp.zoom,
      y: anchor.screenY - newCenterY * vp.zoom,
      zoom: vp.zoom,
    });
  }, [nodes, getViewport, setViewport]);

  const handleNodeMouseEnter = useCallback(
    (_: MouseEvent, node: Node) => {
      const data = node.data as FeatureNodeData;
      if (data.isDimmed) return;
      setHoveredNode(node.id);

      const treeNode = treeNodeMap.get(node.id);
      if (treeNode) {
        const files =
          treeNode.kind === 'folder' && treeNode.files
            ? treeNode.files
            : [treeNode.file];
        onHoverFiles(files);
      }
    },
    [treeNodeMap, onHoverFiles],
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
    onHoverFiles(null);
  }, [onHoverFiles]);

  const handleNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      const data = node.data as FeatureNodeData;
      if (data.kind !== 'folder') return;

      const vp = getViewport();
      const centerX = node.position.x + (node.width ?? 0) / 2;
      const centerY = node.position.y + (node.height ?? 0) / 2;
      anchorRef.current = {
        nodeId: node.id,
        screenX: centerX * vp.zoom + vp.x,
        screenY: centerY * vp.zoom + vp.y,
      };

      setExpandedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });
      setDeepExpandedFolders((prev) => {
        if (!prev.has(node.id)) return prev;
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
      setHoveredNode(null);
      onHoverFiles(null);
    },
    [onHoverFiles, getViewport],
  );

  const handleNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node) => {
      event.preventDefault();
      const data = node.data as FeatureNodeData;
      if (data.kind !== 'folder') return;

      const vp = getViewport();
      const centerX = node.position.x + (node.width ?? 0) / 2;
      const centerY = node.position.y + (node.height ?? 0) / 2;
      anchorRef.current = {
        nodeId: node.id,
        screenX: centerX * vp.zoom + vp.x,
        screenY: centerY * vp.zoom + vp.y,
      };

      setDeepExpandedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) {
          next.delete(node.id);
        } else {
          next.add(node.id);
        }
        return next;
      });
      setExpandedFolders((prev) => {
        if (!prev.has(node.id)) return prev;
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
      setHoveredNode(null);
      onHoverFiles(null);
    },
    [onHoverFiles, getViewport],
  );

  const handlePaneClick = useCallback(() => {
    setHoveredNode(null);
    onHoverFiles(null);
  }, [onHoverFiles]);

  return (
    <div ref={wrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={featureNodeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        nodesDraggable={false}
        nodesConnectable={false}
        onInit={handleInit}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="hsl(var(--border))" gap={20} />
      </ReactFlow>
    </div>
  );
}
