import { ChevronRightIcon } from 'lucide-react';

import { Badge } from '#components/ui/badge';

import { RevealMore } from '../reveal';
import type { FeatureTopic } from '../feature-model';

interface TopicTocProps {
  topics: readonly FeatureTopic[];
  onSelect: (topic: FeatureTopic) => void;
}

/** In-page table of contents: pick one topic to reveal at a time. */
export function TopicToc({ topics, onSelect }: TopicTocProps) {
  return (
    <nav className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Topics
      </h2>
      <RevealMore items={topics} itemKey={(t) => t.id}>
        {(topic) => (
          <button
            type="button"
            onClick={() => onSelect(topic)}
            className="flex w-full items-center gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-ring"
          >
            <span className="flex-1 font-medium">{topic.title}</span>
            {topic.groups.length > 0 && (
              <Badge variant="secondary">
                {topic.groups.length} group
                {topic.groups.length !== 1 ? 's' : ''}
              </Badge>
            )}
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </button>
        )}
      </RevealMore>
    </nav>
  );
}
