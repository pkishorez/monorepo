import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

const tokenize = (s: string): string[] => {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    const isAlnum = /[A-Za-z0-9]/.test(ch);
    if (!isAlnum) {
      if (buf) out.push(buf);
      buf = '';
      continue;
    }
    const prev = s[i - 1];
    const lowerToUpper =
      prev && /[a-z]/.test(prev) && /[A-Z]/.test(ch);
    const acronymEdge =
      prev &&
      /[A-Z]/.test(prev) &&
      /[A-Z]/.test(ch) &&
      /[a-z]/.test(s[i + 1] ?? '');
    if (lowerToUpper || acronymEdge) {
      if (buf) out.push(buf);
      buf = '';
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out.map((t) => t.toLowerCase());
};

const camel = (s: string): string =>
  tokenize(s)
    .map((t, i) => (i === 0 ? t : t[0]!.toUpperCase() + t.slice(1)))
    .join('');

const pascal = (s: string): string =>
  tokenize(s)
    .map((t) => t[0]!.toUpperCase() + t.slice(1))
    .join('');

const kebab = (s: string): string => tokenize(s).join('-');
const snake = (s: string): string => tokenize(s).join('_');

vdescribe(
  'camel',
  'Converts an arbitrary identifier to `camelCase`. The first token is fully lowercased; every later token is title-cased.',
  () => {
    vtest(
      'joins space-separated words',
      'A plain English phrase becomes a single identifier.',
      () => {
        expect(camel('hello world')).toBe('helloWorld');
      },
    );

    vtest(
      'lowercases an already-camel input',
      'Round-tripping `camelCase → camel` is the identity, modulo first-letter casing.',
      () => {
        expect(camel('helloWorld')).toBe('helloWorld');
      },
    );

    vtest(
      'joins hyphen-separated and snake-separated forms',
      'Mixed separators are all treated equivalently.',
      () => {
        expect(camel('hello-world')).toBe('helloWorld');
        expect(camel('hello_world')).toBe('helloWorld');
      },
    );
  },
);

vdescribe(
  'pascal',
  'Same as `camel`, but the first token is also title-cased — the conventional spelling for type names.',
  () => {
    vtest(
      'title-cases the first token',
      'Distinguishes `pascal` from `camel`.',
      () => {
        expect(pascal('hello world')).toBe('HelloWorld');
      },
    );

    vtest('handles a single token', 'Trivial case.', () => {
      expect(pascal('hello')).toBe('Hello');
    });
  },
);

vdescribe(
  'kebab / snake',
  'Lowercase, separator-joined forms. The only difference is the joiner character.',
  () => {
    vtest('splits camelCase by case boundary', 'The core tokenizer behaviour.', () => {
      expect(kebab('helloWorld')).toBe('hello-world');
      expect(snake('helloWorld')).toBe('hello_world');
    });

    vtest(
      'collapses repeated separators',
      'Multiple non-alphanumerics in a row produce a single boundary, not multiple empty tokens.',
      () => {
        expect(kebab('hello   world')).toBe('hello-world');
        expect(snake('hello___world')).toBe('hello_world');
      },
    );
  },
);

vdescribe(
  'acronyms',
  'Acronyms are preserved as a single token; the boundary heuristic looks at the lowercase letter *following* a run of capitals to decide where the acronym ends.',
  () => {
    vtest(
      'keeps acronyms intact in camel output',
      'For `HTTPServer`, the boundary lands between `HTTP` and `Server` — not inside `HTTP`.',
      () => {
        expect(camel('HTTPServer')).toBe('httpServer');
        expect(kebab('HTTPServer')).toBe('http-server');
      },
    );

    vtest(
      'handles trailing acronyms',
      'A trailing all-caps run becomes its own final token.',
      () => {
        expect(kebab('parseURL')).toBe('parse-url');
        expect(snake('toJSON')).toBe('to_json');
      },
    );
  },
);
