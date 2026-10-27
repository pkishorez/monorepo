import { View } from '@kestack/kabuki/react';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import { QuoteLive, TickerLive } from './ticker.ts';

// The price, and which way it last moved.
const QuoteView = View.make(QuoteLive, ({ model, root }) => {
  const up = model.change >= 0;
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <div {...root} className="flex items-baseline gap-3">
      <output className="text-4xl font-semibold tracking-tight tabular-nums">
        {model.price === null ? '–' : model.price.toFixed(2)}
      </output>
      {model.change !== 0 && (
        <span
          className={`flex items-center gap-1 text-sm font-medium tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
        >
          <Icon className="size-4" aria-hidden />
          {up ? '+' : '−'}
          {Math.abs(model.change).toFixed(2)}
        </span>
      )}
    </div>
  );
});

const time = (at: number) => {
  const seconds = Math.floor(at / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// A switch for the feed, the Quote while it's on, and what the feed said.
export const TickerView = View.make(
  TickerLive,
  ({ _tag, model, children, send, root }) => (
    <div
      {...root}
      className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-background"
    >
      <div className="flex h-12 items-center justify-between border-b border-border pl-4 pr-2">
        <span className="text-sm font-medium">KBK</span>
        <label className="flex h-10 cursor-pointer items-center gap-2.5 px-2 text-sm text-muted-foreground">
          Live
          <Switch
            checked={_tag === 'On'}
            onCheckedChange={() => send({ _tag: 'Switched' })}
          />
        </label>
      </div>
      <div className="flex h-24 items-center px-4">
        {_tag === 'On' ? (
          <QuoteView instance={children.quote} />
        ) : (
          <p className="text-sm text-muted-foreground">
            The feed is closed. Turn it on to open it.
          </p>
        )}
      </div>
      <ol className="flex h-[5.25rem] flex-col justify-end gap-1 border-t border-border bg-muted/30 px-4 py-3 font-mono text-xs">
        {model.log.length === 0 ? (
          <li className="text-muted-foreground">The feed hasn’t opened yet.</li>
        ) : (
          model.log.map((line) => (
            <li key={`${line.at}:${line.text}`} className="flex gap-3">
              <span className="text-muted-foreground tabular-nums">
                {time(line.at)}
              </span>
              <span>{line.text}</span>
            </li>
          ))
        )}
      </ol>
    </div>
  ),
);
