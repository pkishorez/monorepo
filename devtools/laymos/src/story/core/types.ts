export type DecisionValue = string | number | boolean;

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
  | { readonly kind: 'error'; readonly error?: string };

export interface TerminalMeta extends BlockMeta {
  readonly completion?: TerminalCompletion;
}

export interface ArmMeta {
  readonly name?: string;
  readonly description: string;
  readonly visibility?: Visibility;
}

export interface StoryMeta {
  readonly description: string;
}

export interface StoryGroupMeta {
  readonly description: string;
}

export interface ScenarioMeta {
  readonly description: string;
}
