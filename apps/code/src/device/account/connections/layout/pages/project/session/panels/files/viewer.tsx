import { type ReactNode, use, useEffect, useMemo, useState } from 'react';
import { ExternalLinkIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import {
  ImageViewer,
  Viewer,
  VIEWER_SURFACE,
  ViewerTool,
} from '@kestack/web-platform/recipes/image-viewer';
import { Markdown } from '../../transcript/words/index.ts';
import { EmbedsContext, KIND_NAMES, nameOf } from './embed.tsx';
import { keyOf, type Ticket, type Viewing } from './files.ts';

/*
 * A File Embed opened whole, over the session, the way the Web Platform's
 * image viewer opens an image, so every kind reads as one: the page
 * dimmed and blurred behind, no frame, its caption and a quiet line of
 * its name, kind and size at the top left, and at the top right a pill
 * with a way to open it in a new tab and Close. Escape, Close, a tap on
 * the backdrop or, on touch, a swipe down close it.
 *
 * An image opens in the image viewer itself, to zoom into. A video plays
 * as large as fits, a sound in the middle under its caption, both with
 * the browser's own controls. A PDF shows in a large frame; a page too,
 * sandboxed with no same-origin, so it may run its scripts but never
 * reach Code or the Connection. A markdown file is fetched and read on a
 * sheet as the agent's words are, the File Embeds in it read from its own
 * folder, and asked for as in a Message of its own, its ticket's URL, so
 * it is asked again when the file is.
 *
 * Opened on a ticket near its end, it waits while the page asks again. A
 * file that fails to load is said to the page, which asks again once.
 */

/** A path's folder: all before its last segment. */
export const folderOf = (path: string) => {
  const at = path.lastIndexOf('/');
  return at <= 0 ? '/' : path.slice(0, at);
};

/** A size in bytes as a person reads it. */
export const sizeOf = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
};

/** The embed open in the viewer, if any, as its page keeps it; null draws nothing. */
export function FileViewer({
  viewing,
  onClose,
}: {
  readonly viewing: Viewing | null;
  readonly onClose: () => void;
}) {
  const embeds = use(EmbedsContext);
  const entry = viewing === null ? undefined : embeds?.tickets[keyOf(viewing)];
  const ticket = entry?._tag === 'Given' ? entry.ticket : null;
  const broke = (url: string) => {
    if (viewing !== null) embeds?.broke(viewing, url);
  };
  const name = ticket?.name ?? (viewing === null ? '' : nameOf(viewing.path));
  const caption = viewing?.caption.trim() || name;
  // Its name, when the caption is not it, then its kind and size.
  const detail =
    [
      name === caption ? '' : name,
      ticket === null ? '' : KIND_NAMES[ticket.kind],
      ticket === null ? '' : sizeOf(ticket.size),
    ]
      .filter((part) => part !== '')
      .join(' · ') || undefined;
  const tools = ticket !== null && (
    <ViewerTool
      label="Open in new tab"
      onClick={() => window.open(ticket.url, '_blank', 'noopener,noreferrer')}
    >
      <ExternalLinkIcon aria-hidden />
    </ViewerTool>
  );
  if (ticket?.kind === 'image')
    return (
      <ImageViewer
        src={ticket.url}
        onClose={onClose}
        caption={caption}
        detail={detail}
        tools={tools}
      />
    );
  // A sound has its caption over its player, in the middle, instead.
  const middle = ticket?.kind === 'audio';
  return (
    <Viewer
      open={viewing !== null}
      onClose={onClose}
      label={caption || 'File'}
      caption={middle ? undefined : caption}
      detail={middle ? undefined : detail}
      tools={tools}
    >
      {viewing === null ? null : entry?._tag === 'Refused' ? (
        <Said>{entry.reason}</Said>
      ) : ticket === null ? (
        <Loading />
      ) : (
        <Whole
          key={ticket.url}
          ticket={ticket}
          caption={caption}
          detail={detail}
          onBroke={() => broke(ticket.url)}
        />
      )}
    </Viewer>
  );
}

/** Words, or a spinner, in the middle of the backdrop. */
function Said({ children }: { readonly children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 p-6 text-center text-sm text-balance text-white/70"
    >
      {children}
    </div>
  );
}

function Loading() {
  return (
    <Said>
      <Spinner />
      <span className="sr-only">Loading</span>
    </Said>
  );
}

/** A frame's look: most of the screen, edged as an image is. */
const FRAME = `min-h-0 w-full max-w-6xl flex-1 bg-white ${VIEWER_SURFACE}`;

/** The file whole, by its kind. */
function Whole({
  ticket,
  caption,
  detail,
  onBroke,
}: {
  readonly ticket: Ticket;
  readonly caption: string;
  readonly detail: string | undefined;
  readonly onBroke: () => void;
}) {
  const probed = useProbe(ticket, onBroke);
  switch (ticket.kind) {
    case 'image':
      return null;
    case 'video':
      return <Video ticket={ticket} caption={caption} onBroke={onBroke} />;
    case 'audio':
      return (
        <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
          <div className="flex max-w-full min-w-0 flex-col gap-1">
            <p className="text-lg font-medium text-balance text-white">
              {caption}
            </p>
            {detail !== undefined && (
              <p className="truncate text-sm text-white/60">{detail}</p>
            )}
          </div>
          <audio
            src={ticket.url}
            controls
            autoPlay
            onError={onBroke}
            // Its controls are dragged, never part of a swipe away.
            data-zone-gesture="disabled"
            className="w-full"
          >
            {caption}
          </audio>
        </div>
      );
    case 'pdf':
      return probed ? (
        <iframe
          src={ticket.url}
          title={caption}
          referrerPolicy="no-referrer"
          className={FRAME}
        />
      ) : (
        <Loading />
      );
    case 'html':
      return probed ? (
        <iframe
          src={ticket.url}
          title={caption}
          sandbox="allow-scripts allow-popups allow-forms allow-modals"
          referrerPolicy="no-referrer"
          className={FRAME}
        />
      ) : (
        <Loading />
      );
    case 'markdown':
      return <Read ticket={ticket} onBroke={onBroke} />;
  }
}

/**
 * A video as large as fits, its shape kept: once its size is known, as
 * wide as the space, or as its height, allows.
 */
function Video({
  ticket,
  caption,
  onBroke,
}: {
  readonly ticket: Ticket;
  readonly caption: string;
  readonly onBroke: () => void;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <div className="grid min-h-0 w-full flex-1 place-items-center [container-type:size]">
      <video
        src={ticket.url}
        controls
        autoPlay
        playsInline
        onError={onBroke}
        onLoadedMetadata={(event) => {
          const { videoWidth, videoHeight } = event.currentTarget;
          if (videoWidth > 0 && videoHeight > 0)
            setRatio(videoWidth / videoHeight);
        }}
        // Its controls are dragged, never part of a swipe away.
        data-zone-gesture="disabled"
        style={
          ratio === null
            ? undefined
            : { aspectRatio: ratio, width: `min(100cqw, ${ratio} * 100cqh)` }
        }
        className={`max-h-full max-w-full bg-black ${VIEWER_SURFACE}`}
      >
        {caption}
      </video>
    </div>
  );
}

/**
 * Whether a file shown in a frame is there: a frame says nothing when it
 * gets a 404, so its URL is asked first, and its body left unread. One
 * not there is said to the page, which asks again.
 */
const useProbe = (ticket: Ticket, onBroke: () => void) => {
  const framed = ticket.kind === 'pdf' || ticket.kind === 'html';
  const [probed, setProbed] = useState(!framed);
  useEffect(() => {
    if (!framed) return;
    const stop = new AbortController();
    fetch(ticket.url, {
      signal: stop.signal,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    }).then(
      (response) => {
        stop.abort();
        if (response.ok) setProbed(true);
        else onBroke();
      },
      () => {
        if (!stop.signal.aborted) onBroke();
      },
    );
    return () => stop.abort();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.url, framed]);
  return probed;
};

/** A markdown file, fetched, read on a sheet as the agent's words are, its embeds read from its own folder. */
function Read({
  ticket,
  onBroke,
}: {
  readonly ticket: Ticket;
  readonly onBroke: () => void;
}) {
  const embeds = use(EmbedsContext);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const stop = new AbortController();
    fetch(ticket.url, {
      signal: stop.signal,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then(setText, () => {
        if (!stop.signal.aborted) onBroke();
      });
    return () => stop.abort();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.url]);
  const own = useMemo(
    () => embeds && { ...embeds, base: folderOf(ticket.path) },
    [embeds, ticket.path],
  );
  if (text === null) return <Loading />;
  return (
    <div
      className={`max-h-full min-h-0 w-full max-w-2xl overflow-y-auto overscroll-contain bg-dialog px-6 py-8 text-foreground sm:px-10 sm:py-10 ${VIEWER_SURFACE}`}
    >
      <EmbedsContext value={own}>
        <Markdown text={text} className="text-base" message={ticket.url} />
      </EmbedsContext>
    </div>
  );
}
