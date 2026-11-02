import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AppWindowIcon,
  FileIcon,
  FileTextIcon,
  FileXIcon,
  FilmIcon,
  ImageIcon,
  MusicIcon,
  PlayIcon,
} from 'lucide-react';
import { embedPath, type FileKind, fileTypeOf } from '@kestack/connect/files';
import type { MarkdownImage } from '@kestack/web-platform/ui/viewers/markdown-viewer';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { MarkdownMessage } from '../../transcript/words/index.ts';
import { type Embed, type Entry, keyOf, wants } from './files.ts';

/*
 * A File Embed, `![caption](files:<path>)`, drawn where the agent wrote it,
 * in its line: nothing is asked until it comes into view, then its ticket
 * is, as the page keeps it (`files.ts`). An image is a framed preview, as
 * a tool's images are; a video, its first frame with a play mark; a page,
 * a PDF, a sound or a markdown file, a small card with its kind's icon,
 * its caption and its file's name. While its ticket is asked for, the same
 * shape, waiting; refused, its caption and path dimmed, and why under
 * them, so a touch screen shows it too. A
 * click opens it in the viewer. A preview that fails to load is said to
 * the page, which asks again once. Its ticket is the one for the Message
 * it is in, so a file written again and embedded in a later Message is
 * not drawn from what the browser kept of the first.
 *
 * Markdown puts an image inside a paragraph, so all of it is drawn in
 * spans and buttons, never a block element.
 */

/** What every File Embed on a session's page reads and tells. */
export interface Embeds {
  readonly connectionId: string;
  /** The folder a relative path is read from, absolute; null until it is known. */
  readonly base: string | null;
  readonly tickets: Readonly<Record<string, Entry>>;
  /** It came into view and has no ticket it may use, `at`. */
  readonly want: (embed: Embed, at: number) => void;
  /** Its ticket's `url` failed to load. */
  readonly broke: (embed: Embed, url: string) => void;
  /** Opens it in the viewer. */
  readonly open: (embed: Embed, caption: string) => void;
}

/** The File Embeds of the page drawn: none outside a session's page. */
export const EmbedsContext = createContext<Embeds | null>(null);

/** Whether an element is on screen, or near it, now. */
const useInView = (element: RefObject<HTMLElement | null>) => {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const at = element.current;
    if (at === null) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((each) => each.isIntersecting)),
      { rootMargin: '200px 0px' },
    );
    observer.observe(at);
    return () => observer.disconnect();
  }, [element]);
  return inView;
};

/** The last segment of a path. */
export const nameOf = (path: string) =>
  path.slice(path.replace(/\/+$/, '').lastIndexOf('/') + 1) || path;

/** Each kind's icon, on its card. */
export const KIND_ICONS: Readonly<
  Record<FileKind, (props: { readonly className?: string }) => ReactNode>
> = {
  image: ImageIcon,
  video: FilmIcon,
  audio: MusicIcon,
  pdf: FileIcon,
  html: AppWindowIcon,
  markdown: FileTextIcon,
};

/** What a person calls each kind. */
export const KIND_NAMES: Readonly<Record<FileKind, string>> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  pdf: 'PDF',
  html: 'Page',
  markdown: 'Markdown',
};

/** A preview's box: as a tool's images are, in its own output. */
const BOX = 'h-40 max-w-full sm:h-56';

/** The frame around a preview, as a tool's images have. */
const FRAME =
  'not-prose focus-ring group relative inline-block max-w-full cursor-zoom-in rounded-lg border border-border bg-muted/50 p-1 align-top transition-colors duration-150 hover:border-foreground/20 hover:bg-muted motion-reduce:transition-none';

/** A card: a kind's icon, a caption over a file's name. */
const CARD =
  'not-prose focus-ring inline-flex max-w-full items-center gap-2.5 rounded-lg border border-border bg-muted/50 py-2 pr-3.5 pl-3 text-left align-middle transition-colors duration-150 hover:border-foreground/20 hover:bg-muted motion-reduce:transition-none';

function CardText({
  caption,
  name,
}: {
  readonly caption: string;
  readonly name: string;
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm leading-5 font-medium text-foreground">
        {caption}
      </span>
      {name !== caption && (
        <span className="truncate font-mono text-xs leading-4 text-muted-foreground">
          {name}
        </span>
      )}
    </span>
  );
}

/** A File Embed, drawn where markdown has the image `![caption](files:<path>)`. */
export function FileEmbed({
  path,
  caption,
}: {
  readonly path: string;
  readonly caption: string;
}) {
  const embeds = use(EmbedsContext);
  const message = use(MarkdownMessage);
  const element = useRef<HTMLSpanElement>(null);
  const inView = useInView(element);
  const embed =
    embeds === null || embeds.base === null
      ? null
      : {
          message,
          connectionId: embeds.connectionId,
          base: embeds.base,
          path,
        };
  const key = embed === null ? null : keyOf(embed);
  const entry = key === null ? undefined : embeds?.tickets[key];
  // In view with no ticket it may use: asked for, once each time that is so.
  useEffect(() => {
    if (!inView || embed === null || embeds === null) return;
    const at = Date.now();
    if (wants(entry, at)) embeds.want(embed, at);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, key, entry]);
  const kind =
    entry?._tag === 'Given' ? entry.ticket.kind : fileTypeOf(path)?.kind;
  const name = entry?._tag === 'Given' ? entry.ticket.name : nameOf(path);
  const said = caption.trim() || name;
  return (
    <span ref={element} className="inline-block max-w-full align-top">
      {entry?._tag === 'Refused' ? (
        <Refused caption={said} path={path} reason={entry.reason} />
      ) : entry?._tag === 'Given' && embed !== null && embeds !== null ? (
        <Shown
          ticket={entry.ticket}
          caption={said}
          onOpen={() => embeds.open(embed, caption)}
          onBroke={() => embeds.broke(embed, entry.ticket.url)}
        />
      ) : (
        <Waiting kind={kind ?? null} caption={said} name={name} />
      )}
    </span>
  );
}

/** Its shape while its ticket is asked for. */
function Waiting({
  kind,
  caption,
  name,
}: {
  readonly kind: FileKind | null;
  readonly caption: string;
  readonly name: string;
}) {
  if (kind === 'image' || kind === 'video')
    return (
      <span
        role="status"
        className={`not-prose inline-flex aspect-[4/3] items-center justify-center rounded-lg border border-border bg-muted/50 ${BOX}`}
      >
        <Spinner className="text-muted-foreground" />
        <span className="sr-only">Loading {caption}</span>
      </span>
    );
  return (
    <span role="status" className={`${CARD} cursor-default`}>
      <Spinner className="shrink-0 text-muted-foreground" />
      <CardText caption={caption} name={name} />
      <span className="sr-only">Loading</span>
    </span>
  );
}

/** Refused: its caption and path dimmed, and why, readable on any screen. */
function Refused({
  caption,
  path,
  reason,
}: {
  readonly caption: string;
  readonly path: string;
  readonly reason: string;
}) {
  return (
    <span
      title={reason}
      className={`${CARD} cursor-default hover:border-border hover:bg-muted/50`}
    >
      <FileXIcon
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground opacity-60"
      />
      <span className="flex min-w-0 flex-col">
        <span className="opacity-60">
          <CardText caption={caption} name={path} />
        </span>
        <span className="text-xs leading-4 break-words text-muted-foreground">
          <span className="sr-only">: </span>
          {reason}
        </span>
      </span>
    </span>
  );
}

/** Its preview or card, opening it in the viewer. */
function Shown({
  ticket,
  caption,
  onOpen,
  onBroke,
}: {
  readonly ticket: Extract<Entry, { _tag: 'Given' }>['ticket'];
  readonly caption: string;
  readonly onOpen: () => void;
  readonly onBroke: () => void;
}) {
  if (ticket.kind === 'image')
    return (
      <button
        type="button"
        aria-label={`Open ${caption}`}
        title={caption}
        onClick={onOpen}
        className={FRAME}
      >
        <img
          src={ticket.url}
          alt={caption}
          referrerPolicy="no-referrer"
          onError={onBroke}
          className={`${BOX} block w-auto rounded-md object-contain`}
        />
      </button>
    );
  if (ticket.kind === 'video')
    return (
      <button
        type="button"
        aria-label={`Play ${caption}`}
        title={caption}
        onClick={onOpen}
        className={`${FRAME} cursor-pointer`}
      >
        <video
          src={ticket.url}
          preload="metadata"
          muted
          playsInline
          onError={onBroke}
          className={`${BOX} block w-auto rounded-md bg-black object-contain`}
        />
        <span className="absolute inset-1 flex items-center justify-center rounded-md">
          <span className="grid size-10 place-items-center rounded-full bg-black/55 text-white transition-transform duration-150 group-hover:scale-105 motion-reduce:transition-none">
            <PlayIcon
              aria-hidden
              className="size-4 translate-x-px fill-current"
            />
          </span>
        </span>
      </button>
    );
  const Icon = KIND_ICONS[ticket.kind];
  return (
    <button
      type="button"
      aria-label={`Open ${caption}, ${KIND_NAMES[ticket.kind]}`}
      onClick={onOpen}
      className={`${CARD} cursor-pointer`}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <CardText caption={caption} name={ticket.name} />
    </button>
  );
}

/**
 * How the transcript's markdown draws an image: a File Embed as one, any
 * other left as markdown draws it.
 */
export const drawEmbed = ({
  src,
  alt,
}: MarkdownImage): ReactNode | undefined => {
  const path = embedPath(src);
  return path === null ? undefined : <FileEmbed path={path} caption={alt} />;
};
