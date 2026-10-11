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

export const ExportView = View.make(Export, ({ _tag, state, send }) => (
  <>
    <Button
      size="sm"
      disabled={_tag !== 'Idle'}
      onClick={() => send({ _tag: 'ClickedExport' })}
    >
      <Download /> {_tag === 'Exporting' ? 'Exporting…' : 'Export PNG'}
    </Button>
    {_tag === 'Failed' && (
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
    )}
  </>
));
