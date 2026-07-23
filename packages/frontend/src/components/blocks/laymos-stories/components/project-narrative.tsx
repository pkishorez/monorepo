import type { ProjectNarrative as ProjectNarrativeArtifact } from 'laymos/report';

import { cn } from '#lib/utils';

import { RichMarkdown } from './rich-markdown';

export function ProjectNarrative({
  project,
  scrollable = true,
}: {
  readonly project: ProjectNarrativeArtifact;
  readonly scrollable?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-background',
        scrollable ? 'h-full overflow-y-auto' : 'min-h-full',
      )}
    >
      <article className="mx-auto w-full max-w-5xl px-8 py-12 sm:px-12">
        <h1 className="mb-8 text-3xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <RichMarkdown>{project.content}</RichMarkdown>
      </article>
    </div>
  );
}
