import { shapeAt } from '../../field/index.ts';
import { column } from '../../components/index.ts';

/*
 * The first screen: one line for the whole stack, its monorepo linked, and
 * a quiet note that the page goes on. On a phone the words sit low, under
 * the field; on a wide screen they sit level with it, in the left half.
 */

export function Hero() {
  return (
    <section
      {...shapeAt('hero', 'right')}
      className="flex min-h-[calc(100svh-3.5rem)] flex-col justify-end lg:justify-center"
    >
      <div className={`${column} pb-12 sm:pb-16 lg:pb-0`}>
        <p className="font-mono text-sm text-muted-foreground">ke stack</p>
        <h1 className="mt-5 text-[2.5rem] leading-[1.12] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
          Everything I build,
          <br />
          in one{' '}
          <a
            href="https://github.com/pkishorez/monorepo"
            target="_blank"
            rel="noreferrer"
            // The underline is a bar in the text's own colour that rises behind
            // the word on hover, as high as its letters and no higher, so it
            // never touches the line above.
            className="-ml-1 rounded-md bg-linear-to-r from-foreground to-foreground bg-size-[100%_0.06em] bg-bottom bg-no-repeat px-1 transition-[background-size,color] duration-150 ease-out hover:bg-size-[100%_76%] hover:text-background focus-visible:bg-size-[100%_76%] focus-visible:text-background motion-reduce:transition-none"
          >
            monorepo
          </a>
          .
        </h1>
        <p className="mt-6 max-w-lg text-lg text-pretty text-muted-foreground">
          All open source. Three of its packages make an app: kabuki draws it,{' '}
          <span className="whitespace-nowrap">std-toolkit</span> keeps its data,{' '}
          <span className="whitespace-nowrap">auth-toolkit</span> signs people
          in.
        </p>
        <p
          aria-hidden
          className="mt-14 flex items-center gap-3 font-mono text-xs text-muted-foreground"
        >
          <span className="h-px w-8 bg-border" />
          scroll
        </p>
      </div>
    </section>
  );
}
