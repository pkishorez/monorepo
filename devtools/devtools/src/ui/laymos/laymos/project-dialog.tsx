import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import { ProjectManager } from './project-manager';

export function ProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Navigate to project</DialogTitle>
          <DialogDescription>
            Pick a project by absolute path, or add a new one.
          </DialogDescription>
        </DialogHeader>
        <ProjectManager onSelected={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
