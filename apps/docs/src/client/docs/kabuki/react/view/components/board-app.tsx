import { useRef } from 'react';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { BoardLive, CardLive } from './board.ts';

/** How many times the View around it has drawn. */
const useDraws = () => {
  const draws = useRef(0);
  draws.current += 1;
  return draws.current;
};

const CardView = View.make(CardLive, ({ model, send, root }) => {
  const draws = useDraws();
  return (
    <div
      {...root}
      className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-3"
    >
      <div>
        <p className="text-sm font-medium">{model.name}</p>
        <p className="font-mono text-xs text-muted-foreground">
          drawn {draws}×
        </p>
      </div>
      <Button variant="outline" onClick={() => send({ _tag: 'Liked' })}>
        Like · {model.likes}
      </Button>
    </div>
  );
});

const BoardView = View.make(BoardLive, ({ children, root }) => {
  const draws = useDraws();
  return (
    <div {...root} className="flex w-full max-w-72 flex-col gap-2">
      {children.cards.map((card) => (
        <CardView key={card.id} instance={card} />
      ))}
      <p className="text-center font-mono text-xs text-muted-foreground">
        board drawn {draws}×
      </p>
    </div>
  );
});

export const BoardApp = View.app(BoardView, { name: 'docs:view' });
