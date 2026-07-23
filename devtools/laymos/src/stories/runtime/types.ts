export type DecisionValue = string | number | boolean | null;

export type Visibility = 'primary' | 'detail';

export type Attributes = Readonly<Record<string, unknown>>;

export type AttributesInput<Args extends readonly unknown[]> =
  | Attributes
  | ((...args: Args) => Attributes);

export interface BlockMeta<Args extends readonly unknown[] = readonly []> {
  readonly description: string;
  readonly attributes?: AttributesInput<Args>;
  readonly visibility?: Visibility;
}

export type TerminalCompletion =
  | { readonly kind: 'success' }
  | { readonly kind: 'error'; readonly error: string };

export interface TerminalMeta extends BlockMeta {
  readonly completion: TerminalCompletion;
}

export interface OmissionMeta {
  readonly reason: string;
}

interface ArmMetaBase {
  readonly name?: string;
  readonly description: string;
  readonly visibility?: Visibility;
}

export type ArmMeta = ArmMetaBase &
  (
    | {
        readonly errors?: readonly string[];
        readonly completion?: never;
      }
    | {
        readonly errors?: never;
        readonly completion?: TerminalCompletion;
      }
  );

export interface StoryMeta {
  readonly description: string;
  readonly documentation?: import('../../markdown/index.js').MarkdownContent;
}

export interface ScenarioMeta {
  readonly description: string;
  readonly documentation?: import('../../markdown/index.js').MarkdownContent;
}
