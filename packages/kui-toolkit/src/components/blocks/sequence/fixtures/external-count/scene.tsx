import { AnimatePresence, Div, enter, exit } from '../../index';

/**
 * Renders a props-injected count of dots in one of two modes. In `grid` mode the
 * dots add/remove as `count` changes (presence via `<AnimatePresence>` + `scale`
 * preset); in `stack` mode the same dots persist by `layoutId` and only rotate.
 */
export const dots = ({
  count,
  mode,
}: {
  count: number;
  mode: 'grid' | 'stack';
}) => {
  const list = Array.from({ length: count }, (_, i) => i);
  if (mode === 'stack') {
    return (
      <div className="relative size-[calc(14.7*var(--u))]">
        {list.map((d, i) => (
          <Div
            key={d}
            layoutId={`dot-${d}`}
            animate={{ rotate: i * 12 }}
            className="absolute inset-0 m-auto size-[calc(8.8*var(--u))] rounded-full bg-gradient-to-br from-cyan-400/70 to-blue-500/70 mix-blend-screen shadow-lg"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-[calc(1.5*var(--u))]">
      <AnimatePresence>
        {list.map((d) => (
          <Div
            key={d}
            layoutId={`dot-${d}`}
            {...enter.scale}
            exit={exit.scale}
            className="size-[calc(5.9*var(--u))] rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 shadow-md"
          />
        ))}
      </AnimatePresence>
    </div>
  );
};
