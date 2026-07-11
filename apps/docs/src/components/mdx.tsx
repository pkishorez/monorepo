import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Button } from '@monorepo/frontend/components/ui/button';
import { SwimLane } from '@monorepo/frontend/components/blocks/swim-lane';
import { StatusBadge } from './status-badge';
import { ESchemaPlayground } from './eschema-playground';
import { SyncStrategyVisualizer } from './sync-strategy-visualizer';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Button,
    StatusBadge,
    ESchemaPlayground,
    SyncStrategyVisualizer,
    SwimLane,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
