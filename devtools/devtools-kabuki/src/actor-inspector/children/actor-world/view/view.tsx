import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { fakesOf } from '../logic/shared/index.ts';
import type { WorldShape } from '../logic/shared/index.ts';
import { FakeCard } from './fake.tsx';

type BodyProps = ViewPropsOf<typeof WorldShape>;

export function Body(self: BodyProps) {
  const { send } = self;
  return (
    <ul
      aria-label="Fakes"
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
    >
      {fakesOf(self).map((fake) => (
        <li key={fake.name}>
          <FakeCard
            fake={fake}
            onRun={(control, payload) =>
              send({ _tag: 'Ran', fake: fake.name, control, payload })
            }
            onDismiss={() => send({ _tag: 'Dismissed' })}
          />
        </li>
      ))}
    </ul>
  );
}
