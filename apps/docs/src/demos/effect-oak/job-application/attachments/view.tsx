import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import { FileText, Paperclip, Upload, X } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { fileSize } from '../application/index.js';
import { Attachments } from './attachments.js';

type Info = { readonly name: string; readonly size: number };

const infoOf = (files: FileList | null): ReadonlyArray<Info> =>
  Array.from(files ?? [], (file) => ({ name: file.name, size: file.size }));

/** A dashed box that takes files from a picker or a drop. */
const DropZone = ({
  id,
  label,
  hint,
  multiple,
  onFiles,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly multiple: boolean;
  readonly onFiles: (files: ReadonlyArray<Info>) => void;
}) => (
  <label
    htmlFor={id}
    className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-6 text-center text-sm hover:bg-muted/50"
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => {
      event.preventDefault();
      const files = infoOf(event.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    }}
  >
    <Upload className="size-5 text-muted-foreground" />
    <span className="font-medium">{label}</span>
    <span className="text-muted-foreground">{hint}</span>
    <input
      id={id}
      type="file"
      className="sr-only"
      multiple={multiple}
      onChange={(event) => {
        const files = infoOf(event.target.files);
        event.target.value = '';
        if (files.length > 0) onFiles(files);
      }}
    />
  </label>
);

const FileRow = ({
  file,
  icon,
  onRemove,
}: {
  readonly file: Info;
  readonly icon: ReactNode;
  readonly onRemove: () => void;
}) => (
  <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
    {icon}
    <span className="min-w-0 flex-1 truncate">{file.name}</span>
    <span className="text-muted-foreground">{fileSize(file.size)}</span>
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Remove ${file.name}`}
      onClick={onRemove}
    >
      <X />
    </Button>
  </div>
);

export const AttachmentsView = View.make(Attachments, ({ model, send }) => (
  <div className="flex flex-col gap-6">
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Resume</h3>
      {model.resume ? (
        <FileRow
          file={model.resume}
          icon={<FileText className="size-4" />}
          onRemove={() => send({ _tag: 'RemovedResume' })}
        />
      ) : (
        <DropZone
          id="resume"
          label="Drop your resume here, or click to choose"
          hint="PDF, Word or text"
          multiple={false}
          onFiles={(files) => send({ _tag: 'DroppedResume', files })}
        />
      )}
    </section>
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Additional files</h3>
      {model.others.map((file, index) => (
        <FileRow
          key={`${index}-${file.name}`}
          file={file}
          icon={<Paperclip className="size-4" />}
          onRemove={() => send({ _tag: 'RemovedOther', index })}
        />
      ))}
      <DropZone
        id="additional-files"
        label="Drop more files here, or click to choose"
        hint="Portfolio pieces, references, anything else"
        multiple
        onFiles={(files) => send({ _tag: 'DroppedOthers', files })}
      />
    </section>
  </div>
));
