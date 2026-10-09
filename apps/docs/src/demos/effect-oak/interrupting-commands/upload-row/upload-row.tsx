import { useRef } from 'react';
import type { UseFrame } from 'effect-oak/react';
import { Badge } from '@kstackz/web-platform/components/badge';
import { Button } from '@kstackz/web-platform/components/button';

type Upload = {
  readonly id: number;
  readonly fileName: string;
  readonly sizeMegabytes: number;
  readonly status: 'Uploading' | 'Done' | 'Cancelled';
  readonly startedAt: number;
};

const BADGE = {
  Uploading: 'secondary',
  Done: 'default',
  Cancelled: 'outline',
} as const;

/** How far an upload has got at a Frame, moved through a ref without a render. */
const Progress = ({
  useFrame,
  startedAt,
  duration,
}: {
  readonly useFrame: UseFrame;
  readonly startedAt: number;
  readonly duration: number;
}) => {
  const bar = useRef<HTMLDivElement>(null);
  useFrame((at) => {
    const done = Math.min(1, Math.max(0, (at - startedAt) / duration));
    bar.current?.style.setProperty('width', `${done * 100}%`);
  });
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div ref={bar} className="h-full bg-primary" />
    </div>
  );
};

/** One upload: its file, its status, and Cancel or Restart. */
export const UploadRow = ({
  upload,
  msPerMegabyte,
  useFrame,
  onCancel,
  onRestart,
}: {
  readonly upload: Upload;
  readonly msPerMegabyte: number;
  readonly useFrame: UseFrame;
  readonly onCancel: () => void;
  readonly onRestart: () => void;
}) => (
  <li className="flex flex-col gap-2 rounded-lg border p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-medium">{upload.fileName}</span>
        <span className="shrink-0 text-sm text-muted-foreground">
          {upload.sizeMegabytes} MB
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={BADGE[upload.status]}>{upload.status}</Badge>
        {upload.status === 'Uploading' && (
          <Button
            size="sm"
            variant="outline"
            aria-label={`Cancel upload ${upload.id}`}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        {upload.status === 'Cancelled' && (
          <Button
            size="sm"
            variant="outline"
            aria-label={`Restart upload ${upload.id}`}
            onClick={onRestart}
          >
            Restart
          </Button>
        )}
      </div>
    </div>
    {upload.status === 'Uploading' && (
      <Progress
        useFrame={useFrame}
        startedAt={upload.startedAt}
        duration={upload.sizeMegabytes * msPerMegabyte}
      />
    )}
  </li>
);
