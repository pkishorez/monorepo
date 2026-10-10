import {
  Alert,
  AlertDescription,
} from '@kstackz/web-platform/components/alert';
import { Button } from '@kstackz/web-platform/components/button';
import { Spinner } from '@kstackz/web-platform/components/spinner';

/** What shows while there is no data yet. */
export const LoadingPanel = ({ text }: { readonly text: string }) => (
  <p className="flex items-center justify-center gap-2 rounded-lg border p-6 text-sm text-muted-foreground">
    <Spinner /> {text}
  </p>
);

/** A failed fetch, with a way to try again. */
export const ErrorPanel = ({
  error,
  onRetry,
}: {
  readonly error: string;
  readonly onRetry: () => void;
}) => (
  <Alert variant="destructive">
    <AlertDescription className="flex items-center justify-between gap-4">
      <span>{error}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </AlertDescription>
  </Alert>
);
