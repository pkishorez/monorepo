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
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-xl [&>*]:min-w-0">
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
