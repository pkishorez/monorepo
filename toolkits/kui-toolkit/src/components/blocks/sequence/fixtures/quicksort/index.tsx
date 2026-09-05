import { step, useSteps } from '../../index';
import { Demo } from '../shared';
import { quickBars } from './components/bars';
import { quickFinale } from './components/finale';
import { quickTitle } from './components/title';
import { bar, q } from './model';

/**
 * quicksort — a 10-frame walkthrough across three step types (title → bars →
 * finale). Colours cross-fade as roles change; a stable `layoutId` carries each
 * bar through every partition reorder into the finale.
 */
export function Quicksort() {
  const seq = useSteps(
    step(
      'step1',
      { text: 'Quicksort', subtitle: 'watch the partitions settle' },
      quickTitle,
    ),
    step(
      'step2',
      bar(q('a', 'b', 'c', 'd', 'e', 'f'), null, [], [], []),
      quickBars,
    ),
    step(
      'step3',
      bar(q('a', 'b', 'c', 'd', 'e', 'f'), 'f', [], [], []),
      quickBars,
    ),
    step(
      'step4',
      bar(
        q('a', 'b', 'c', 'd', 'e', 'f'),
        'f',
        ['b', 'd'],
        ['a', 'c', 'e'],
        [],
      ),
      quickBars,
    ),
    step(
      'step5',
      bar(q('b', 'd', 'f', 'a', 'c', 'e'), null, [], [], ['f']),
      quickBars,
    ),
    step(
      'step6',
      bar(q('b', 'd', 'f', 'a', 'c', 'e'), 'd', [], ['b'], ['f']),
      quickBars,
    ),
    step(
      'step7',
      bar(q('d', 'b', 'f', 'a', 'c', 'e'), null, [], [], ['d', 'b', 'f']),
      quickBars,
    ),
    step(
      'step8',
      bar(
        q('d', 'b', 'f', 'a', 'c', 'e'),
        'e',
        ['a', 'c'],
        [],
        ['d', 'b', 'f'],
      ),
      quickBars,
    ),
    step(
      'step9',
      bar(
        q('d', 'b', 'f', 'a', 'c', 'e'),
        null,
        [],
        [],
        ['d', 'b', 'f', 'a', 'c', 'e'],
      ),
      quickBars,
    ),
    step(
      'step10',
      { order: q('d', 'b', 'f', 'a', 'c', 'e'), text: 'Sorted!' },
      quickFinale,
    ),
  );
  return (
    <Demo
      sequence={seq}
      caption="A 10-frame walkthrough across three step types (title → bars → finale). Colors cross-fade as roles change; stable layoutId carries each bar through every partition reorder into the finale."
    />
  );
}
