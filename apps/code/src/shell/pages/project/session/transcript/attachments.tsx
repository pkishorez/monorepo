import {
  Attachment as Frame,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@kestack/web-platform/ui/components/attachment';
import {
  FileAudioIcon,
  FileIcon,
  FileTextIcon,
  FileVideoCameraIcon,
} from '@kestack/web-platform/ui/components/lucide';
import type { TurnAttachment } from './thread.ts';

/*
 * The files sent with a turn, under your words: an image the agent saw as
 * a thumbnail; any other file as a chip with its name and size, the path
 * it was saved at on hover.
 */

const KB = 1024;
const MB = KB * KB;

const bytes = (size: number) =>
  size < KB
    ? `${size} B`
    : size < MB
      ? `${Math.round(size / KB)} KB`
      : `${(size / MB).toFixed(size < 10 * MB ? 1 : 0)} MB`;

function KindIcon({ mime }: { readonly mime: string }) {
  if (mime.startsWith('video/')) return <FileVideoCameraIcon aria-hidden />;
  if (mime.startsWith('audio/')) return <FileAudioIcon aria-hidden />;
  if (mime.startsWith('text/') || mime === 'application/json')
    return <FileTextIcon aria-hidden />;
  return <FileIcon aria-hidden />;
}

export function Attachments({
  attachments,
}: {
  readonly attachments: ReadonlyArray<TurnAttachment>;
}) {
  if (attachments.length === 0) return null;
  const images = attachments.filter(({ data }) => data !== undefined);
  const files = attachments.filter(({ data }) => data === undefined);
  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && (
        <ul aria-label="Images" className="flex flex-wrap gap-2">
          {images.map(({ name, mime, data }, at) => (
            <li key={`${at}-${name}`}>
              <img
                src={`data:${mime};base64,${data}`}
                alt={name}
                title={name}
                className="size-24 rounded-md object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
              />
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul aria-label="Files" className="flex flex-wrap gap-1.5">
          {files.map(({ name, mime, size, path }, at) => (
            <li key={`${at}-${name}`} className="min-w-0">
              <Frame size="sm" className="max-w-64 min-w-0 bg-card">
                <AttachmentMedia variant="icon">
                  <KindIcon mime={mime} />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle title={path ?? name}>{name}</AttachmentTitle>
                  <AttachmentDescription className="tabular-nums">
                    {bytes(size)}
                  </AttachmentDescription>
                </AttachmentContent>
              </Frame>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
