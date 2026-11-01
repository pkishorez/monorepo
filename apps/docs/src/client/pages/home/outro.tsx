import { ArrowUpRightIcon } from 'lucide-react';
import { button } from '../../components/index.ts';
import { Stop } from '../../field/index.ts';
import { MONOREPO } from '../../../shared/index.ts';

/*
 * The end of the story: more is coming, said in one large word and a
 * small line under it, drawn as packages being built beside the one that
 * is. Its shape takes the right, as the opening's
 * did, so the sides alternate down the page; the way to follow along is
 * the code.
 */

export function Outro() {
  return (
    <Stop shape="outro" side="right" last data-chapter aria-labelledby="outro">
      <h2 id="outro" className="font-semibold tracking-tight">
        <span className="block text-5xl sm:text-6xl">More</span>
        <span className="mt-1 block text-xl font-normal text-muted-foreground sm:text-2xl">
          coming soon…
        </span>
      </h2>
      <a
        href={MONOREPO}
        target="_blank"
        rel="noreferrer"
        className={`mt-6 ${button.outline}`}
      >
        GitHub
        <ArrowUpRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" />
      </a>
    </Stop>
  );
}
