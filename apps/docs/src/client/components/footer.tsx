import { column } from './styles.ts';

/** Who made it, and where its code is. */
export function Footer() {
  return (
    <footer className="border-t border-border">
      <div
        className={`${column} flex flex-wrap items-center justify-between gap-2 py-6 text-xs text-muted-foreground`}
      >
        <span>Built with kabuki start, served by one Cloudflare Worker.</span>
        <a href="https://kishore.app" className="hover:text-foreground">
          kishore.app
        </a>
      </div>
    </footer>
  );
}
