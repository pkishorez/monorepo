import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Cause, Effect, Option } from 'effect';
import type {
  ESchemaDescriptor,
  ValueDraftDefinition,
  ValueEnvelopeEncoded,
  ValueEvolution,
  ValueSchema,
  ValueSchemaDecoded,
} from '../domain/schema-model/index.js';
import { makeDraftedValueSchemaRuntime } from './value-schema-runtime/index.js';

const constructionToken = Symbol();

export class DraftedValueESchema<
  TVersion extends string,
  TLatest extends ValueSchema,
  TDraft extends ValueSchema,
> implements StandardSchemaV1<unknown, ValueSchemaDecoded<TDraft>> {
  readonly #runtime;

  private constructor(
    token: typeof constructionToken,
    readonly name: string,
    readonly latestVersion: TVersion,
    evolutions: readonly ValueEvolution[],
    draft: ValueDraftDefinition,
  ) {
    if (token !== constructionToken) {
      throw new TypeError('Invalid DraftedValueESchema');
    }
    this.#runtime = makeDraftedValueSchemaRuntime<TVersion, TLatest, TDraft>({
      owner: this,
      name,
      latestVersion,
      evolutions,
      draft,
    });
  }

  static internalMake<
    V extends string,
    L extends ValueSchema,
    D extends ValueSchema,
  >(
    name: string,
    version: V,
    evolutions: readonly ValueEvolution[],
    draft: ValueDraftDefinition,
  ): DraftedValueESchema<V, L, D> {
    return new DraftedValueESchema<V, L, D>(
      constructionToken,
      name,
      version,
      evolutions,
      draft,
    );
  }

  Type = null as unknown as ValueSchemaDecoded<TDraft>;
  Encoded = null as unknown as ValueEnvelopeEncoded<TVersion, TLatest>;

  get schema(): TLatest {
    return this.#runtime.schema();
  }

  decode(value: unknown) {
    return this.#runtime.decode(value);
  }

  encode(value: ValueSchemaDecoded<TDraft>) {
    return this.#runtime.encode(value);
  }

  getDescriptor(): ESchemaDescriptor {
    return this.#runtime.descriptor();
  }

  '~standard' = {
    version: 1 as const,
    vendor: 'std-toolkit/eschema',
    types: {
      input: null as unknown as ValueSchemaDecoded<TDraft>,
      output: null as unknown as ValueSchemaDecoded<TDraft>,
    },
    validate: (value: unknown) => {
      const result = Effect.runSyncExit(this.decode(value));
      if (result._tag === 'Success') return { value: result.value };
      const error = Cause.findErrorOption(result.cause);
      return Option.isSome(error)
        ? { issues: [{ message: error.value.message }] }
        : { issues: [{ message: 'Unknown error' }] };
    },
  };
}
