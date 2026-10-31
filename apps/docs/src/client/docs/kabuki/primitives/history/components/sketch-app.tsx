import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { SketchLive } from './sketch.ts';

const COLOURS = {
  ink: 'bg-foreground',
  rose: 'bg-rose-500',
  amber: 'bg-amber-400',
  sky: 'bg-sky-500',
} as const;

const SketchView = View.make(SketchLive, ({ model, send, root }) => (
  <div {...root} className="flex flex-col items-center gap-5">
    <div className="grid grid-cols-5 gap-1">
      {model.cells.map((colour, cell) => (
        <button
          key={cell}
          type="button"
          aria-label={`Cell ${cell + 1}`}
          onClick={() => send({ _tag: 'Painted', cell })}
          className={`size-8 rounded-md border border-border transition-colors ${colour ? COLOURS[colour] : 'bg-muted/40 hover:bg-muted'}`}
        />
      ))}
    </div>
    <div className="flex gap-2">
      {(Object.keys(COLOURS) as Array<keyof typeof COLOURS>).map((colour) => (
        <button
          key={colour}
          type="button"
          aria-label={colour}
          aria-pressed={colour === model.colour}
          onClick={() => send({ _tag: 'Picked', colour })}
          className={`size-7 rounded-full ${COLOURS[colour]} ring-offset-2 ring-offset-background transition-shadow ${colour === model.colour ? 'ring-2 ring-foreground' : ''}`}
        />
      ))}
    </div>
  </div>
));

export const SketchApp = View.app(SketchView, { name: 'docs:history' });
