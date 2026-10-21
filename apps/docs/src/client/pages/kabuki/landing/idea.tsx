import { Chapter } from './chapter.tsx';
import type { Idea as Story } from './story.ts';

/* One of kabuki's five ideas, numbered, its words beside its shape. */

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
