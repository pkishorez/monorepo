import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Canvas } from '../../../view/shared/index.ts';
import { cardsOf } from '../logic/shared/index.ts';
import type { BlueprintShape } from '../logic/shared/index.ts';

type BodyProps = ViewPropsOf<typeof BlueprintShape>;

const always = () => true;

export function Body(self: BodyProps) {
  const { model, send } = self;
  const root = cardsOf(self);
  if (model.problem)
    return <p className="p-6 text-sm text-muted-foreground">{model.problem}</p>;
  if (!root) return null;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Canvas
        root={root}
        opened={model.opened}
        unfold={always}
        folding={false}
        onOpen={(id, open) => send({ _tag: 'Opened', id, open })}
      />
    </div>
  );
}
