import type { ShapeName } from '../../field/index.ts';
import { Chapter } from './chapter.tsx';

/* One of a package's ideas, numbered, its words beside its shape. */

export type Story = {
  readonly shape: ShapeName;
  /** A word or two after the number, in mono. */
  readonly label: string;
  readonly title: string;
  /** In it, `backticks` mark code. */
  readonly body: string;
};

/**
 * Which half of a wide screen the shape of the stop `stop` places after
 * the opening takes. The opening's demo sits on the right, so the first
 * shape takes the left, and every shape after crosses the screen.
 */
export const sideOf = (stop: number): 'left' | 'right' =>
  stop % 2 === 0 ? 'left' : 'right';

export function Idea({
  idea,
  index,
}: {
  readonly idea: Story;
  readonly index: number;
}) {
  return (
    <Chapter
      shape={idea.shape}
      side={sideOf(index)}
      number={index + 1}
      label={idea.label}
      id={`idea-${idea.shape}`}
      title={idea.title}
    >
      <p className="mt-3 text-pretty text-muted-foreground sm:mt-4 sm:text-lg">
        {idea.body.split('`').map((part, at) =>
          // Every second part sat between backticks: it is code.
          at % 2 === 1 ? (
            <code key={at} className="font-mono text-[0.9em] text-foreground">
              {part}
            </code>
          ) : (
            part
          ),
        )}
      </p>
    </Chapter>
  );
}
