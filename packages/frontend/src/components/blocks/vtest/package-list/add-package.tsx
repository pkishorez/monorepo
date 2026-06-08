import { useState } from 'react';

import { PlusIcon } from 'lucide-react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';

interface AddPackageProps {
  /** Discovery candidates the user can pick instead of typing a path. */
  discovery?: readonly string[];
  onAddByPath: (path: string) => void;
}

/** "Add by path" / "pick from discovery" affordance for the home screen. */
export function AddPackage({ discovery = [], onAddByPath }: AddPackageProps) {
  const [path, setPath] = useState('');

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline">
            <PlusIcon className="size-4" />
            Add a package
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a package</DialogTitle>
          <DialogDescription>
            Point vtest at a package by path, or pick one from discovery.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Input
            value={path}
            placeholder="packages/my-package"
            onChange={(e) => setPath(e.target.value)}
          />

          {discovery.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Discovered
              </span>
              {discovery.map((candidate) => (
                <DialogClose
                  key={candidate}
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start font-mono text-xs"
                      onClick={() => onAddByPath(candidate)}
                    >
                      {candidate}
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button
                disabled={path.trim().length === 0}
                onClick={() => onAddByPath(path.trim())}
              >
                Add
              </Button>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
