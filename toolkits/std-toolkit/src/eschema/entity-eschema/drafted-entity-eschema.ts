import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Cause, Effect, Option, Schema } from 'effect';
import type {
  DraftDefinition,
  ESchemaDescriptor,
  Evolution,
  Prettify,
  StructFieldsDecoded,
  StructFieldsEncoded,
  StructFieldsSchema,
} from '../domain/schema-model/index.js';
import { makeDraftedObjectSchemaRuntime } from '../domain/object-schema-runtime/index.js';

const constructionToken = Symbol();

export class DraftedEntityESchema<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
  TDraft extends StructFieldsSchema,
> implements StandardSchemaV1<unknown, Prettify<StructFieldsDecoded<TDraft>>> {
  readonly #runtime;

  private constructor(
    token: typeof constructionToken,
    readonly name: TName,
    readonly idField: TIdField,
    readonly latestVersion: TVersion,
    evolutions: readonly Evolution[],
    draft: DraftDefinition,
  ) {
    if (token !== constructionToken) {
      throw new TypeError('Invalid DraftedEntityESchema');
    }
    this.#runtime = makeDraftedObjectSchemaRuntime<TVersion, TLatest, TDraft>({
      owner: this,
      name,
      kind: 'entity',
      idField,
      latestVersion,
      evolutions,
      draft,
    });
  }

  static internalMake<
    N extends string,
    Id extends string,
    V extends string,
    L extends StructFieldsSchema,
    D extends StructFieldsSchema,
  >(
    name: N,
    idField: Id,
    version: V,
    evolutions: readonly Evolution[],
    draft: DraftDefinition,
  ): DraftedEntityESchema<N, Id, V, L, D> {
    return new DraftedEntityESchema<N, Id, V, L, D>(
      constructionToken,
      name,
      idField,
      version,
      evolutions,
      draft,
    );
  }

  Type = null as unknown as Prettify<StructFieldsDecoded<TDraft>>;
  Encoded = null as unknown as Prettify<StructFieldsEncoded<TLatest>> & {
    readonly _v: TVersion;
  };

  get fields(): TLatest {
    return this.#runtime.fields();
  }

  get schema(): Schema.Struct<TLatest> {
    return Schema.Struct(this.fields);
  }

  makePartial(value: Partial<StructFieldsDecoded<TLatest>>) {
    return { ...value, _v: this.latestVersion };
  }

  decode(value: unknown) {
    return this.#runtime.decode(value);
  }

  encode(value: StructFieldsDecoded<TDraft>) {
    return this.#runtime.encode(value);
  }

  getDescriptor(): ESchemaDescriptor {
    return this.#runtime.descriptor();
  }

  '~standard' = {
    version: 1 as const,
    vendor: 'std-toolkit/eschema',
    types: {
      input: null as unknown as Prettify<StructFieldsDecoded<TDraft>>,
      output: null as unknown as Prettify<StructFieldsDecoded<TDraft>>,
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
