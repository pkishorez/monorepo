import { AlertTriangleIcon } from 'lucide-react';

import type { Diagnostic } from '../types';

interface DiagnosticsNoteProps {
  diagnostics: readonly Diagnostic[];
}

/** Compact, calm summary of a feature's static diagnostics (if any). */
export function DiagnosticsNote({ diagnostics }: DiagnosticsNoteProps) {
  if (diagnostics.length === 0) return null;

  const errors = diagnostics.filter((d) => d.level === 'error').length;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        {diagnostics.length} diagnostic{diagnostics.length !== 1 ? 's' : ''}
        {errors > 0 ? ` (${errors} error${errors !== 1 ? 's' : ''})` : ''}
      </span>
    </div>
  );
}
