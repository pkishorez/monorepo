import { Effect } from 'effect';
import type { FileContent, FileList } from 'laymos';

const contents: Readonly<Record<string, string>> = {
  'src/domain/orders/index.ts': [
    "export { placeOrder, type Order } from './order';",
    '',
  ].join('\n'),
  'src/domain/orders/order.ts': [
    "import { newId } from '../../core/ids';",
    "import { total } from './internal';",
    '',
    'export interface Order {',
    '  readonly id: string;',
    '  readonly lines: readonly { sku: string; qty: number }[];',
    '}',
    '',
    "export function placeOrder(lines: Order['lines']): Order {",
    '  const order = { id: newId(), lines };',
    "  if (total(order) === 0) throw new Error('empty order');",
    '  return order;',
    '}',
    '',
  ].join('\n'),
  'src/domain/orders/internal.ts': [
    "import type { Order } from './order';",
    '',
    'export const total = (order: Order) =>',
    '  order.lines.reduce((sum, line) => sum + line.qty, 0);',
    '',
  ].join('\n'),
  'src/domain/orders/generated.ts':
    '// generated: do not edit\nexport const schema = {};\n',
  'src/domain/orders/README.md': [
    '# orders',
    '',
    'Placing an **Order** from lines. The Index exports `placeOrder` and the',
    '`Order` type; everything else is internal.',
    '',
    '- `order.ts` builds the Order',
    '- `internal.ts` sums it',
    '',
  ].join('\n'),
  'src/domain/orders/order.test.ts': [
    "import { expect, test } from 'vitest';",
    "import { placeOrder } from './order';",
    '',
    "test('places an order', () => {",
    "  expect(placeOrder([{ sku: 'a', qty: 1 }]).lines).toHaveLength(1);",
    '});',
    '',
  ].join('\n'),
};

export const fixtureFileList: FileList = {
  modulePath: 'src/domain/orders',
  index: 'src/domain/orders/index.ts',
  files: [
    { path: 'src/domain/orders/README.md', analyzed: false },
    { path: 'src/domain/orders/docs/diagram.png', analyzed: false },
    { path: 'src/domain/orders/generated.ts', analyzed: false },
    { path: 'src/domain/orders/index.ts', analyzed: true },
    { path: 'src/domain/orders/internal.ts', analyzed: true },
    { path: 'src/domain/orders/order.test.ts', analyzed: true },
    { path: 'src/domain/orders/order.ts', analyzed: true },
  ],
};

export const loadFixtureFileList = (modulePath: string) =>
  Effect.succeed({ ...fixtureFileList, modulePath }).pipe(
    Effect.delay('150 millis'),
  );

export const loadFixtureFileContent = (
  path: string,
): Effect.Effect<FileContent, Error> =>
  Effect.suspend(() => {
    if (path.endsWith('.png'))
      return Effect.succeed({ path, content: '', binary: true });
    const content = contents[path];
    return content === undefined
      ? Effect.fail(new Error(`No such file: ${path}`))
      : Effect.succeed({ path, content });
  }).pipe(Effect.delay('120 millis'));
