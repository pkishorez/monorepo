import { useState, type FormEvent } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Input } from '@monorepo/frontend/components/ui/input';
import { isValidBaseUrl } from './store';

const DEFAULT_URL = 'http://localhost:14318';

export function ConfigForm({
  initialValue,
  submitLabel = 'Save',
  onSubmit,
  onCancel,
}: {
  initialValue?: string;
  submitLabel?: string;
  onSubmit: (baseUrl: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initialValue ?? DEFAULT_URL);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!isValidBaseUrl(trimmed)) {
      setError('Enter a valid http(s) URL');
      return;
    }
    setError(null);
    onSubmit(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md mx-auto space-y-3 p-6 rounded-lg border border-border/40"
    >
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="otel-base-url">
          lotel base URL
        </label>
        <p className="text-xs text-muted-foreground">
          The local OpenTelemetry server URL. Defaults to lotel's dev port.
        </p>
      </div>
      <Input
        id="otel-base-url"
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={DEFAULT_URL}
        autoFocus
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
