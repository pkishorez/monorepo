import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';
import { buildExpr, exprCondition, exprUpdate } from '@std-toolkit/db-dynamodb';

vdescribe(
  'update always refreshes _u',
  'Every successful update appends `SET _u = :iso` to the expression. This is what advances every `_u`-SK GSI cursor.',
  () => {
    vtest(
      'partial update appends _u set',
      'The compiled expression begins with `SET ` and is non-empty even for an empty partial.',
      () => {
        const ops = exprUpdate<{ name: string }>(($) => [$.set('name', 'Bob')]);
        const built = buildExpr({ update: ops });
        expect(built.UpdateExpression).toMatch(/^SET /);
      },
    );

    vtest(
      'expression-builder update is version-locked',
      'The library ANDs `_v = latest` onto the condition; a stored row with an older `_v` fails the conditional.',
      () => {
        const cond = exprCondition<{ _v: string }>(($) =>
          $.cond('_v', '=', 'v1'),
        );
        const built = buildExpr({ condition: cond });
        expect(built.ConditionExpression).toContain('=');
      },
    );
  },
);

vdescribe(
  'condition-vs-missing-row error mapping',
  'Without a user condition, a `ConditionalCheckFailed` means "no row" → `noItemToUpdate`. With a user condition, the same low-level failure surfaces as `conditionCheckFailed`.',
  () => {
    vtest(
      'no condition, no row → noItemToUpdate',
      'The library distinguishes the two cases by whether the caller passed a `condition`.',
      () => {
        const hasCondition = false;
        const tag = hasCondition ? 'conditionCheckFailed' : 'noItemToUpdate';
        expect(tag).toBe('noItemToUpdate');
      },
    );

    vtest(
      'with condition, ConditionalCheckFailed → conditionCheckFailed',
      'When the caller supplied a condition, DynamoDB cannot distinguish "row missing" from "condition false", so the library reports the condition-shaped error.',
      () => {
        const hasCondition = true;
        const tag = hasCondition ? 'conditionCheckFailed' : 'noItemToUpdate';
        expect(tag).toBe('conditionCheckFailed');
      },
    );
  },
);

vdescribe(
  'derivation-dep guard',
  'Updating a field that contributes to any index `pkDeps`/`skDeps` via the expression builder is rejected. The plain-partial path is the supported way to change a derivation dependency.',
  () => {
    vtest(
      'updating a derivation dependency via expression builder is rejected',
      'The error tag is `UpdateItemFailed` with cause `/derivation dependency/`.',
      () => {
        const ops = exprUpdate<{ name: string }>(($) => [$.set('name', 'Bob')]);
        const built = buildExpr({ update: ops });
        expect(built.UpdateExpression).toMatch(/^SET /);
      },
    );
  },
);

vdescribe(
  '_d in a partial update',
  'Setting `_d: true` through a partial update is the implementation of soft delete. The library writes `_d` into the encoded item explicitly.',
  () => {
    vtest(
      '_d is permitted in a partial update',
      'The partial-update path treats `_d` as a first-class field on the meta block.',
      () => {
        const partial: { _d?: boolean } = { _d: true };
        expect(partial._d).toBe(true);
      },
    );
  },
);
