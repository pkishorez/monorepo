import { View } from 'effect-oak/react';
import { Download } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kstackz/web-platform/components/alert-dialog';
import { Button } from '@kstackz/web-platform/components/button';
import { Export } from './export.js';

export const ExportView = View.make(Export, {
  Idle: ({ send }) => (
    <Button size="sm" onClick={() => send({ _tag: 'ClickedExport' })}>
      <Download /> Export PNG
    </Button>
  ),
  Exporting: () => (
    <Button size="sm" disabled>
      <Download /> Exporting…
    </Button>
  ),
  Failed: ({ state, send }) => (
    <>
      <Button size="sm" disabled>
        <Download /> Export PNG
      </Button>
      <AlertDialog
        open
        onOpenChange={(open) => {
          if (!open) send({ _tag: 'DismissedError' });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export failed</AlertDialogTitle>
            <AlertDialogDescription>{state.error}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => send({ _tag: 'DismissedError' })}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  ),
});
