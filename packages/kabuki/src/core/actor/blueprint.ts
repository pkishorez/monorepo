import { Schema, SchemaAST } from 'effect';
import type { ActorDefinition, QuerySchemas } from './definition/index.ts';

/*
 * The Blueprint: what an Actor is and does, as plain data, with nothing
 * running. Made from the Actor's Definition the first time it is read, and
 * kept: an Actor that is its own Child below has one Blueprint, so the tree
 * of Blueprints may loop back on itself. Every tool that describes an Actor
 * reads it, never how the engine holds it.
 */

/** What an Actor is and does: its name, its Schemas, its Requires, and its levels, the top and each State. */
export interface Blueprint {
  readonly name: string;
  readonly schemas: BlueprintSchemas;
  /** The keys of the Capabilities its own code may use. */
  readonly requires: ReadonlyArray<string>;
  /** What holds in every State, for as long as the Instance lives. */
  readonly top: BlueprintLevel;
  /** What holds in each State, for as long as it lasts, by tag: every State it can be in. */
  readonly state: Readonly<Record<string, BlueprintState>>;
}

/** The Schemas an Actor is defined with; one it was not given is absent, but the Model, `{}` unless declared. */
export interface BlueprintSchemas {
  readonly input?: Schema.Top;
  readonly model: Schema.Top;
  readonly props?: Schema.Top;
  readonly emits?: Schema.Top;
  /** Each Query's, by name. */
  readonly queries?: Readonly<Record<string, QuerySchemas>>;
}

/** One level of an Actor: its top, or one State's block. */
export interface BlueprintLevel {
  /** The Messages it has an Update for, each with its Schema, by tag. */
  readonly on: Readonly<Record<string, Schema.Top>>;
  readonly workers: ReadonlyArray<BlueprintWorker>;
  /** Its Children, by slot. */
  readonly children: Readonly<Record<string, BlueprintChild>>;
  /** The Queries it answers, by name. */
  readonly queries: ReadonlyArray<string>;
  /** The keys of the Capabilities it Provides to everything below it. */
  readonly provides: ReadonlyArray<string>;
}

/** One State: its level, and the Schema of the data that exists only in it. */
export interface BlueprintState extends BlueprintLevel {
  readonly data: Schema.Top;
}

/** One Worker: its name and its Condition, `instance` or `state` for one that runs always where it is written. */
export interface BlueprintWorker {
  readonly name: string;
  readonly kind: 'instance' | 'state' | 'while' | 'each';
}

/** One Child slot: the Child's Blueprint, its Condition, and whether it is held under a key. */
export interface BlueprintChild {
  readonly blueprint: Blueprint;
  readonly kind: 'always' | 'while' | 'each';
  readonly keyed: boolean;
}

/** The Model of an Actor declared without one. */
const EMPTY = Schema.Struct({});
/** The one State of an Actor declared without States. */
const SINGLE = Schema.TaggedStruct('Single', {});

/** A level with nothing in it, until the real one is made. */
const NOTHING: BlueprintLevel = {
  on: {},
  workers: [],
  children: {},
  queries: [],
  provides: [],
};

const made = new WeakMap<ActorDefinition, Blueprint>();

/** The Blueprint of an Actor as the engine holds it, made once. */
export const blueprintOf = (definition: ActorDefinition): Blueprint => {
  const kept = made.get(definition);
  if (kept) return kept;
  const { schemas } = definition;
  const blueprint: { -readonly [K in keyof Blueprint]: Blueprint[K] } = {
    name: definition.name,
    schemas: {
      ...(schemas.input ? { input: schemas.input } : {}),
      model: schemas.model ?? EMPTY,
      ...(schemas.props ? { props: schemas.props } : {}),
      ...(schemas.emits ? { emits: schemas.emits } : {}),
      ...(schemas.queries ? { queries: schemas.queries } : {}),
    },
    requires: definition.requires.map(({ key }) => key),
    top: NOTHING,
    state: {},
  };
  // Kept before its levels are made, so a Child that is this same Actor
  // finds it rather than making it again.
  made.set(definition, blueprint);

  const lasting = new Set(definition.lasting);
  const level = (state: string | undefined): BlueprintLevel => {
    const provides =
      state === undefined
        ? definition.provides
        : definition.stateProvides[state];
    const slots = definition.children[state ?? definition.states[0]!] ?? {};
    return {
      on: Object.fromEntries(
        Object.keys(definition.update[state ?? '*'] ?? {}).map((tag) => [
          tag,
          caseOf(schemas.message, tag) ?? Schema.Unknown,
        ]),
      ),
      workers: Object.entries(definition.workers)
        .filter(([, worker]) => worker.state === state)
        .map(([name, { kind }]) => ({ name, kind })),
      children: Object.fromEntries(
        Object.entries(slots)
          .filter(([slot]) => lasting.has(slot) === (state === undefined))
          .map(([slot, { definition, kind, keyed }]) => [
            slot,
            { blueprint: blueprintOf(definition), kind, keyed },
          ]),
      ),
      queries: Object.entries(definition.queries)
        .filter(([, query]) => query.state === state)
        .map(([name]) => name),
      provides: (provides?.capabilities ?? []).map(({ key }) => key),
    };
  };
  blueprint.top = level(undefined);
  blueprint.state = Object.fromEntries(
    definition.states.map((tag) => [
      tag,
      {
        ...level(tag),
        data: schemas.state
          ? (caseOf(schemas.state, tag) ?? schemas.state)
          : SINGLE,
      },
    ]),
  );
  return blueprint;
};

/**
 * The Blueprint at a place in the tree an Actor can grow: the root's name,
 * then one segment per Child, its slot, after its parent's State and a `:`
 * when it is written in a State, `App/Inside:downloads/files`. Undefined
 * where no Child is written.
 */
const at = (root: Blueprint, place: string): Blueprint | undefined => {
  const [name, ...path] = place.split('/');
  if (name !== root.name) return undefined;
  let here: Blueprint | undefined = root;
  for (const segment of path) {
    if (!here) return undefined;
    const colon = segment.indexOf(':');
    const level: BlueprintLevel | undefined =
      colon === -1 ? here.top : own(here.state, segment.slice(0, colon));
    here = level && own(level.children, segment.slice(colon + 1))?.blueprint;
  }
  return here;
};

const own = <T>(record: Readonly<Record<string, T>>, key: string) =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** The case of a tagged union with this tag: from its cases, its members, or itself. */
const caseOf = (
  schema: Schema.Top | undefined,
  tag: string,
): Schema.Top | undefined => {
  if (!schema) return undefined;
  const { cases, members } = schema as {
    readonly cases?: Readonly<Record<string, Schema.Top>>;
    readonly members?: ReadonlyArray<Schema.Top>;
  };
  if (cases) return own(cases, tag);
  if (members)
    return members.find((member) => tagOf(member.ast) === tag) ?? undefined;
  return tagOf(schema.ast) === tag ? schema : undefined;
};

/** The tag a struct is tagged with, if any. */
const tagOf = (ast: SchemaAST.AST): string | undefined => {
  if (!SchemaAST.isObjects(ast)) return undefined;
  const found = ast.propertySignatures.find(({ name }) => name === '_tag');
  return found && SchemaAST.isLiteral(found.type)
    ? String(found.type.literal)
    : undefined;
};

/** Reading an Actor's Blueprint: the one at a place in its tree. */
export const Blueprint = { at };
