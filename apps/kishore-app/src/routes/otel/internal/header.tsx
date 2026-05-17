import { useState } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@monorepo/frontend/components/ui/alert-dialog';
import { PencilIcon, Trash2Icon } from '@monorepo/frontend/lucide';
import { ConfigForm } from './config-form';

export function Header({
  baseUrl,
  onChangeBaseUrl,
  onClear,
}: {
  baseUrl: string;
  onChangeBaseUrl: (next: string) => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  if (editing) {
    return (
      <ConfigForm
        initialValue={baseUrl}
        submitLabel="Update"
        onSubmit={(next) => {
          onChangeBaseUrl(next);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border/40 bg-muted/20">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">lotel base URL</div>
        <div className="text-sm font-mono truncate">{baseUrl}</div>
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditing(true)}
          aria-label="Edit base URL"
        >
          <PencilIcon className="size-4" />
        </Button>
        <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
          <AlertDialogTrigger
            aria-label="Clear all records"
            render={
              <Button variant="ghost" size="icon-sm">
                <Trash2Icon className="size-4" />
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all telemetry?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes every trace, log, and metric from the lotel server
                and resets the local view. The base URL is preserved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onClear();
                  setClearOpen(false);
                }}
              >
                Clear
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
