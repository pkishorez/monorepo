import type { Comment, Rule } from '@oxlint/plugins';

const ruleName = 'monoverse/no-comments';

const bundlerHints = [
  '@vite-ignore',
  '#__PURE__',
  '@__PURE__',
  '#__NO_SIDE_EFFECTS__',
  '@__NO_SIDE_EFFECTS__',
];

type Verdict =
  | 'allowed'
  | 'comment'
  | 'directiveWithoutReason'
  | 'disablesItself';

const directiveVerdict = (text: string): Verdict => {
  const [head = '', reason] = text.split(/\s--\s?/, 2);
  const [keyword = '', ...named] = head.trim().split(/[\s,]+/);
  if (named.some((rule) => rule === ruleName)) return 'disablesItself';
  if (keyword === 'oxlint-enable') return 'allowed';
  return named.length > 0 && reason?.trim()
    ? 'allowed'
    : 'directiveWithoutReason';
};

const verdictOf = (comment: Comment): Verdict => {
  if (comment.type === 'Shebang') return 'allowed';
  const text = comment.value.trim();
  if (/^oxlint-(disable|enable)/.test(text)) return directiveVerdict(text);
  if (comment.type === 'Line' && text.startsWith('@ts-')) return 'allowed';
  if (comment.type === 'Line' && /^\/\s*<reference\s/.test(comment.value))
    return 'allowed';
  if (comment.type === 'Block' && bundlerHints.includes(text)) return 'allowed';
  return 'comment';
};

const fileStart = {
  start: { line: 1, column: 0 },
  end: { line: 1, column: 0 },
};

export const noComments: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow comments, except the ones tools read: lint directives with a reason, TypeScript directives, triple-slash references and bundler hints.',
    },
    messages: {
      comment:
        "Comments are not allowed. Say it in code (a name, a type, a test), or move the note to this package's docs/.",
      directiveWithoutReason:
        'Name the rule this directive turns off, and say why after `--`.',
      disablesItself: `Line {{line}} turns ${ruleName} off, which it cannot be. Move the note to this package's docs/.`,
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const verdict = verdictOf(comment);
          if (verdict === 'disablesItself')
            context.report({
              messageId: verdict,
              data: { line: String(comment.loc.start.line) },
              loc: fileStart,
            });
          else if (verdict !== 'allowed')
            context.report({ messageId: verdict, loc: comment.loc });
        }
      },
    };
  },
};
