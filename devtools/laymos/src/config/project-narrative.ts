import type { MarkdownContent } from '../markdown/index.js';

export interface ProjectNarrativeDef {
  readonly kind: 'project-narrative';
  readonly name: string;
  readonly content: MarkdownContent;
}

export interface ProjectNarrative {
  readonly kind: 'project-narrative';
  readonly name: string;
  readonly content: string;
}

/** Declares the optional project-level human account. */
export function projectNarrative(
  name: string,
  content: MarkdownContent,
): ProjectNarrativeDef {
  return { kind: 'project-narrative', name, content };
}

export function serializeProjectNarrative(
  narrative: ProjectNarrativeDef,
): ProjectNarrative {
  return {
    kind: narrative.kind,
    name: narrative.name,
    content: narrative.content.content,
  };
}
