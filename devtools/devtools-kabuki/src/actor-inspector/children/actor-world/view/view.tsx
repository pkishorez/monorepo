import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { fakesOf } from '../logic/shared/index.ts';
import type { WorldShape } from '../logic/shared/index.ts';
import { FakeCard } from './fake.tsx';

type BodyProps = ViewPropsOf<typeof WorldShape>;

export function Body(self: BodyProps) {
  const { send } = self;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ul
        aria-label="Fakes"
        className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 pb-16 @3xl:px-6 @3xl:pt-5"
      >
        {fakesOf(self).map((fake) => (
          <li key={fake.name}>
            <FakeCard
              fake={fake}
              onRun={(control, payload) =>
                send({
                  _tag: 'Submitted',
                  fake: fake.name,
                  control,
                  payload,
                })
              }
              onEdit={(control) =>
                send({ _tag: 'Edited', fake: fake.name, control })
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
