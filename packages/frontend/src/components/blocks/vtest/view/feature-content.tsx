import { Fragment } from 'react';

import { Markdown } from '../markdown';
import type { VtestConfigFeature } from '../types';
import { splitAtDirectives } from './markdown-outline';
import { TestGroupCard } from './test-group-card';

interface FeatureContentProps {
  feature: VtestConfigFeature;
}

/**
 * The center reading column: interleaves the feature's markdown prose with
 * inline test-group cards rendered at each directive's character offset.
 */
export function FeatureContent({ feature }: FeatureContentProps) {
  const segments = splitAtDirectives(feature.markdown, feature.directives);
  const groupsById = new Map(feature.groups.map((g) => [g.id, g]));

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10 lg:px-10">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
        {feature.name}
      </h1>
      {segments.map((segment, i) => {
        if (segment.kind === 'prose') {
          return <Markdown key={i} source={segment.source} />;
        }
        const group = groupsById.get(segment.id);
        if (!group) {
          return (
            <p
              key={i}
              className="my-4 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
            >
              Unresolved test group <code>{segment.id}</code>.
            </p>
          );
        }
        return (
          <Fragment key={i}>
            <TestGroupCard group={group} />
          </Fragment>
        );
      })}
    </article>
  );
}
