import { Button } from '@kestack/web-platform/components/button';
import {
  CircleAlertIcon,
  PaperclipIcon,
} from '@kestack/web-platform/components/lucide';
import { useRef, useState } from 'react';
import { Chip } from './chip.tsx';
import { readFiles, type Attachment } from './read.ts';

/*
 * Files on a message. They arrive three ways: pasted or dropped anywhere
 * on the page, or picked with the paperclip. Each is read once into base64
 * and handed to the parent, which owns the list. A file over its limit is
 * left out and a line under the chips says which and why, until the next
 * file arrives or the message is sent.
 */

export type { Attachment };

export function useAttachments({
  attachments,
  onChange,
  disabled,
}: {
  readonly attachments: ReadonlyArray<Attachment>;
  readonly onChange: (attachments: ReadonlyArray<Attachment>) => void;
  readonly disabled: boolean;
}) {
  const [refused, setRefused] = useState<ReadonlyArray<string>>([]);
  const latest = useRef(attachments);
  latest.current = attachments;

  const add = async (files: ReadonlyArray<File>) => {
    if (disabled || files.length === 0) return;
    const { read, refused } = await readFiles(files);
    setRefused(refused);
    if (read.length > 0) onChange([...latest.current, ...read]);
  };

  const remove = (index: number) => {
    setRefused([]);
    onChange(latest.current.filter((_, at) => at !== index));
  };

  const settle = () => setRefused([]);

  return { add, remove, settle, refused };
}

export function AttachmentStrip({
  attachments,
  refused,
  disabled,
  onRemove,
}: {
  readonly attachments: ReadonlyArray<Attachment>;
  readonly refused: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly onRemove: (index: number) => void;
}) {
  if (attachments.length === 0 && refused.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {attachments.length > 0 && (
        <ul aria-label="Attached files" className="flex flex-wrap gap-1.5">
          {attachments.map((attachment, index) => (
            <li key={`${index}-${attachment.name}`} className="min-w-0">
              <Chip
                attachment={attachment}
                disabled={disabled}
                onRemove={() => onRemove(index)}
              />
            </li>
          ))}
        </ul>
      )}
      {refused.length > 0 && (
        <div role="alert" className="flex flex-col gap-0.5 px-1">
          {refused.map((reason) => (
            <p
              key={reason}
              className="flex items-start gap-2 text-sm text-destructive"
            >
              <CircleAlertIcon
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0"
              />
              {reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function AttachButton({
  disabled,
  onFiles,
}: {
  readonly disabled: boolean;
  readonly onFiles: (files: ReadonlyArray<File>) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => {
          onFiles([...(event.currentTarget.files ?? [])]);
          event.currentTarget.value = '';
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Attach files"
        title="Attach files"
        disabled={disabled}
        className="shrink-0 text-muted-foreground"
        onClick={() => input.current?.click()}
      >
        <PaperclipIcon aria-hidden />
      </Button>
    </>
  );
}
