export type DecisionValue = string | number | boolean;

export type Attributes = Readonly<Record<string, unknown>>;

export type AttributesInput<Args extends readonly unknown[]> =
  | Attributes
  | ((...args: Args) => Attributes);

export interface BlockMeta<Args extends readonly unknown[] = readonly []> {
  readonly description: string;
  readonly attributes?: AttributesInput<Args>;
}

export interface ArmMeta {
  readonly name?: string;
  readonly description: string;
}

export interface StoryMeta {
  readonly description: string;
}

export interface ScenarioMeta {
  readonly description: string;
}
