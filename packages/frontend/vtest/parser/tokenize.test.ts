import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

type Token =
  | { kind: 'NUMBER'; value: number }
  | { kind: 'OP'; op: '+' | '-' | '*' | '/' }
  | { kind: 'LPAREN' }
  | { kind: 'RPAREN' };

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isOp = (c: string): c is '+' | '-' | '*' | '/' =>
  c === '+' || c === '-' || c === '*' || c === '/';

const tokenize = (input: string): Token[] => {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === ' ' || c === '\t' || c === '\n') {
      i += 1;
      continue;
    }
    if (isDigit(c)) {
      let j = i;
      while (j < input.length && isDigit(input[j]!)) j += 1;
      out.push({ kind: 'NUMBER', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (isOp(c)) {
      out.push({ kind: 'OP', op: c });
      i += 1;
      continue;
    }
    if (c === '(') {
      out.push({ kind: 'LPAREN' });
      i += 1;
      continue;
    }
    if (c === ')') {
      out.push({ kind: 'RPAREN' });
      i += 1;
      continue;
    }
    throw new SyntaxError(`unexpected character ${c} at offset ${i}`);
  }
  return out;
};

vdescribe(
  'numbers',
  'Multi-digit integers are emitted as a single `NUMBER` token.',
  () => {
    vtest('single digit', 'The simplest possible input.', () => {
      expect(tokenize('7')).toEqual([{ kind: 'NUMBER', value: 7 }]);
    });

    vtest('multiple digits become one token', 'The scanner is greedy.', () => {
      expect(tokenize('1234')).toEqual([{ kind: 'NUMBER', value: 1234 }]);
    });
  },
);

vdescribe(
  'operators and parens',
  'Operator characters and parentheses each become a single-character token.',
  () => {
    vtest(
      'plus and minus',
      'Tests that adjacent operator characters tokenize independently — `1+-2` produces three tokens, not one.',
      () => {
        // Whitespace is optional and ignored.
        const tokens = tokenize('1+-2');
        expect(tokens).toEqual([
          { kind: 'NUMBER', value: 1 },
          { kind: 'OP', op: '+' },
          { kind: 'OP', op: '-' },
          { kind: 'NUMBER', value: 2 },
        ]);
      },
    );

    vtest(
      'parens around an expression',
      'Snippet-extractor stress: this body uses a template literal with `${}` interpolation that contains a `(` and a `)` — the scanner must not treat those as the outer call boundary.',
      () => {
        const input = `(1 + 2)`;
        const expected = `(1 + 2)`;
        // The literal we just built (`${expected}`) and the input should agree.
        expect(input).toBe(expected);
        expect(tokenize(input)).toEqual([
          { kind: 'LPAREN' },
          { kind: 'NUMBER', value: 1 },
          { kind: 'OP', op: '+' },
          { kind: 'NUMBER', value: 2 },
          { kind: 'RPAREN' },
        ]);
      },
    );
  },
);

vdescribe(
  'whitespace and comments',
  'Whitespace is skipped; comments are not part of the grammar but appear in test bodies that exercise the snippet extractor.',
  () => {
    vtest(
      'skips spaces, tabs, and newlines',
      'A body spanning multiple lines with mixed whitespace.',
      () => {
        // The tokenizer should treat all of these as equivalent.
        const a = tokenize('1 + 2');
        const b = tokenize('1\t+\t2');
        const c = tokenize('1\n+\n2');
        expect(a).toEqual(b);
        expect(b).toEqual(c);
      },
    );

    vtest(
      'string args containing parens do not confuse anything',
      'Snippet-extractor stress: the string literal `")"` below contains a paren that must NOT close the outer `vtest(` call.',
      () => {
        const paren = ')';
        const fakeOpen = '(';
        expect(paren).toBe(')');
        expect(fakeOpen).toBe('(');
        // Sanity: tokenizer still works on a real expression with parens.
        expect(tokenize('(7)')).toEqual([
          { kind: 'LPAREN' },
          { kind: 'NUMBER', value: 7 },
          { kind: 'RPAREN' },
        ]);
      },
    );
  },
);

vdescribe(
  'errors',
  'Unrecognised characters produce a `SyntaxError` carrying the offset.',
  () => {
    vtest(
      'throws on an unknown character',
      'The error message mentions the offending character and its zero-based offset.',
      () => {
        expect(() => tokenize('1 ? 2')).toThrow(
          /unexpected character \? at offset 2/,
        );
      },
    );

    vtest(
      'nested arrow function in the body',
      'Snippet-extractor stress: defining and invoking an inner arrow function with its own parens.',
      () => {
        const double = (n: number): number => n * 2;
        const values = [1, 2, 3].map(double);
        expect(values).toEqual([2, 4, 6]);
      },
    );
  },
);
