import { motion, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';
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

/** How far an upload has got at each Frame, without a render. */
const Progress = ({
  frame,
  startedAt,
  duration,
}: {
  readonly frame: MotionValue<number>;
  readonly startedAt: number;
  readonly duration: number;
}) => {
  const width = useTransform(
    frame,
    (at) => `${Math.min(1, Math.max(0, (at - startedAt) / duration)) * 100}%`,
  );
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <motion.div style={{ width }} className="h-full bg-primary" />
    </div>
  );
};

/** One upload: its file, its status, and Cancel or Restart. */
export const UploadRow = ({
  upload,
  msPerMegabyte,
  frame,
  onCancel,
  onRestart,
}: {
  readonly upload: Upload;
  readonly msPerMegabyte: number;
  readonly frame: MotionValue<number>;
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
        frame={frame}
        startedAt={upload.startedAt}
        duration={upload.sizeMegabytes * msPerMegabyte}
      />
    )}
  </li>
);
