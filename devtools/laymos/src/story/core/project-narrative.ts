import type { Layer, LayerGraph, ModuleDef } from '../../config/types.js';

export interface MarkdownContent {
  readonly kind: 'markdown';
  readonly content: string;
}

export type ProjectReference =
  | { readonly kind: 'layer-graph'; readonly name: string }
  | { readonly kind: 'layer'; readonly name: string }
  | { readonly kind: 'module'; readonly path: string };

export type ProjectReferenceDef = LayerGraph | Layer | ModuleDef;

export interface ProjectTopicDef {
  readonly kind: 'topic';
  readonly title: string;
  readonly description: MarkdownContent;
  readonly references: readonly ProjectReferenceDef[];
  readonly children: readonly ProjectTopicDef[];
}

export interface ProjectMapDef {
  readonly kind: 'project-map';
  readonly root: ProjectTopicDef;
}

export type ProjectNarrativeDefBlock = MarkdownContent | ProjectMapDef;

export interface ProjectNarrativeDef {
  readonly kind: 'project-narrative';
  readonly name: string;
  readonly blocks: readonly ProjectNarrativeDefBlock[];
}

export interface ProjectTopic {
  readonly kind: 'topic';
  readonly title: string;
  readonly description: string;
  readonly references: readonly ProjectReference[];
  readonly children: readonly ProjectTopic[];
}

export interface ProjectMap {
  readonly kind: 'project-map';
  readonly root: ProjectTopic;
}

export type ProjectNarrativeBlock = MarkdownContent | ProjectMap;

export interface ProjectNarrative {
  readonly kind: 'project-narrative';
  readonly name: string;
  readonly blocks: readonly ProjectNarrativeBlock[];
}

export interface ProjectTopicOptions {
  readonly description: MarkdownContent;
  readonly references?: readonly ProjectReferenceDef[];
  readonly children?: readonly ProjectTopicDef[];
}

/** Authors Markdown without introducing MDX or executable components. */
export function markdown(
  strings: TemplateStringsArray,
  ...values: readonly (string | number)[]
): MarkdownContent {
  const content = strings.reduce(
    (result, part, index) => result + part + (values[index] ?? ''),
    '',
  );
  return { kind: 'markdown', content: dedent(content) };
}

/** Declares one responsibility in a Project Map. */
export function topic(
  title: string,
  options: ProjectTopicOptions,
): ProjectTopicDef {
  return {
    kind: 'topic',
    title,
    description: options.description,
    references: options.references ?? [],
    children: options.children ?? [],
  };
}

/** Declares one architectural responsibility tree. */
export function projectMap(root: ProjectTopicDef): ProjectMapDef {
  return { kind: 'project-map', root };
}

/** Declares the optional project-level human account. */
export function projectNarrative(
  name: string,
  blocks: readonly ProjectNarrativeDefBlock[],
): ProjectNarrativeDef {
  return { kind: 'project-narrative', name, blocks };
}

export function serializeProjectNarrative(
  narrative: ProjectNarrativeDef,
): ProjectNarrative {
  return {
    kind: narrative.kind,
    name: narrative.name,
    blocks: narrative.blocks.map((block) =>
      block.kind === 'markdown'
        ? block
        : {
            kind: block.kind,
            root: serializeTopic(block.root),
          },
    ),
  };
}

function serializeTopic(topicDef: ProjectTopicDef): ProjectTopic {
  return {
    kind: topicDef.kind,
    title: topicDef.title,
    description: topicDef.description.content,
    references: topicDef.references.map((reference) =>
      reference.kind === 'module'
        ? { kind: reference.kind, path: reference.path }
        : { kind: reference.kind, name: reference.name },
    ),
    children: topicDef.children.map(serializeTopic),
  };
}

function dedent(value: string): string {
  const lines = value.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(indent)).join('\n');
}
