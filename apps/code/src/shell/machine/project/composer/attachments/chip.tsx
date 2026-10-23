import {
  Attachment as Frame,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@kestack/web-platform/components/attachment';
import {
  FileAudioIcon,
  FileIcon,
  FileTextIcon,
  FileVideoCameraIcon,
  XIcon,
} from '@kestack/web-platform/components/lucide';
import { formatSize, type Attachment } from './read.ts';

/* One attached file: a thumbnail for an image, else an icon for its kind,
 * then its name and size, and a button that takes it off. */

export function Chip({
  attachment: { name, mime, data, size },
  disabled,
  onRemove,
}: {
  readonly attachment: Attachment;
  readonly disabled: boolean;
  readonly onRemove: () => void;
}) {
  const image = mime.startsWith('image/');
  return (
    <Frame size="sm" className="max-w-56 min-w-0 pr-1">
      <AttachmentMedia variant={image ? 'image' : 'icon'}>
        {image ? (
          <img src={`data:${mime};base64,${data}`} alt="" />
        ) : (
          <KindIcon mime={mime} />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={name}>{name}</AttachmentTitle>
        <AttachmentDescription className="tabular-nums">
          {formatSize(size)}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          aria-label={`Remove ${name}`}
          disabled={disabled}
          onClick={onRemove}
          className="relative after:absolute after:-inset-1 after:content-['']"
        >
          <XIcon aria-hidden />
        </AttachmentAction>
      </AttachmentActions>
    </Frame>
  );
}

function KindIcon({ mime }: { readonly mime: string }) {
  if (mime.startsWith('video/')) return <FileVideoCameraIcon aria-hidden />;
  if (mime.startsWith('audio/')) return <FileAudioIcon aria-hidden />;
  if (mime.startsWith('text/') || mime === 'application/json')
    return <FileTextIcon aria-hidden />;
  return <FileIcon aria-hidden />;
}
