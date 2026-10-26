import { Schema, SchemaAST } from 'effect';
import { RpcSchema, type Rpc } from 'effect/rpc';
import {
  eschemaOf,
  type AnyEvolvingSchema,
} from '@kestack/std-toolkit/eschema';

/*
 * The guard both contracts' tests run: every value an Rpc sends, its
 * payload, its success or each item it streams, is an ESchema, so a newer
 * side reads what an older one sends. A list of ESchema values is one, each
 * item carrying its own version. Nothing, a string, a number, a boolean or a
 * literal may stay plain: if one must ever change its type, it becomes a new
 * Rpc. An error's fields follow the same rule.
 */

/** Every value in a group that is not built from an ESchema, and every ESchema it sends. */
export const versionedValuesOf = (group: {
  readonly requests: ReadonlyMap<string, Rpc.AnyWithProps>;
}) => {
  const problems: Array<string> = [];
  const eschemas = new Set<AnyEvolvingSchema>();

  const check = (ast: SchemaAST.AST, at: string): void => {
    const eschema = eschemaOf(Schema.make(ast));
    if (eschema !== undefined) {
      eschemas.add(eschema);
      return;
    }
    switch (ast._tag) {
      case 'Void':
      case 'Never':
      case 'Null':
      case 'String':
      case 'Number':
      case 'Boolean':
      case 'Literal':
        return;
      case 'Arrays':
        ast.elements.forEach((each) => check(each, `${at}[]`));
        ast.rest.forEach((each) => check(each, `${at}[]`));
        return;
      case 'Union':
        ast.types.forEach((each) => check(each, at));
        return;
      case 'Suspend':
        check(ast.thunk(), at);
        return;
      default:
        problems.push(`${at} is a plain ${ast._tag}, not an ESchema`);
    }
  };

  /** An error's fields, each one, as the error class or union of them declares. */
  const checkErrors = (schema: Schema.Top, at: string) => {
    const errors =
      'members' in schema
        ? (schema.members as ReadonlyArray<Schema.Top>)
        : [schema];
    for (const error of errors) {
      if (!('fields' in error)) continue;
      const fields = error.fields as Schema.Struct.Fields;
      const tag = fields['_tag']?.ast;
      const name =
        tag !== undefined && SchemaAST.isLiteral(tag)
          ? String(tag.literal)
          : 'error';
      for (const [field, value] of Object.entries(fields))
        check(value.ast, `${at} ${name}.${field}`);
    }
  };

  for (const rpc of group.requests.values()) {
    check(rpc.payloadSchema.ast, `${rpc._tag} payload`);
    const stream = RpcSchema.isStreamSchema(rpc.successSchema)
      ? rpc.successSchema
      : null;
    if (stream === null) {
      check(rpc.successSchema.ast, `${rpc._tag} success`);
      checkErrors(rpc.errorSchema, `${rpc._tag} error`);
    } else {
      check(stream.success.ast, `${rpc._tag} item`);
      checkErrors(stream.error, `${rpc._tag} error`);
    }
  }
  return { problems, eschemas: [...eschemas] };
};
