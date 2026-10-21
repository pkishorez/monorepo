import { Chapter } from './chapter.tsx';
import { PRIOR_ART } from './story.ts';

/*
 * Where kabuki's ideas come from: each source named, linked where it has a
 * home, with the one thing kabuki took from it.
 */

export function PriorArt() {
  return (
    <Chapter
      shape={PRIOR_ART.shape}
      label={PRIOR_ART.label}
      id="prior-art"
      title={PRIOR_ART.title}
    >
      {/* On a phone the list alone fits under the shape. */}
      <p className="mt-4 text-lg text-pretty text-muted-foreground max-sm:hidden">
        {PRIOR_ART.pitch}
      </p>
      <dl className="mt-5 text-[13px] sm:mt-6 sm:text-sm">
        {PRIOR_ART.sources.map((source) => (
          <div
            key={source.name}
            className="grid grid-cols-[7.5rem_1fr] gap-x-3 border-t border-border py-1.5 sm:grid-cols-[8.5rem_1fr] sm:gap-x-4 sm:py-2.5"
          >
            <dt className="font-mono text-[13px] text-foreground">
              {'href' in source ? (
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  className="-my-3 inline-flex min-h-11 items-center underline decoration-border underline-offset-4 transition-colors duration-150 hover:decoration-foreground motion-reduce:transition-none"
                >
                  {source.name}
                </a>
              ) : (
                source.name
              )}
            </dt>
            <dd className="text-pretty text-muted-foreground">{source.line}</dd>
          </div>
        ))}
      </dl>
    </Chapter>
  );
}
