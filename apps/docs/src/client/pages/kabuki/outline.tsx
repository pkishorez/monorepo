import type { Heading } from '../../docs/index.ts';
import { Placeholder } from '../../components/index.ts';

/** A page not written yet: the headings it will have, each over a placeholder. */
export function Outline({
  headings,
}: {
  readonly headings: ReadonlyArray<Heading>;
}) {
  return (
    <div className="space-y-8">
      {headings.map((heading) => (
        <section key={heading.id} className="space-y-4">
          <h2
            id={heading.id}
            className="scroll-mt-20 text-xl font-semibold tracking-tight"
          >
            {heading.title}
          </h2>
          <Placeholder className="h-32">
            Words and a demo for “{heading.title}”
          </Placeholder>
        </section>
      ))}
    </div>
  );
}
