import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';

export function Composer({
  ready,
  onAdd,
}: {
  readonly ready: boolean;
  readonly onAdd: (title: string) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const title = String(new FormData(form).get('title') ?? '').trim();
        if (title === '') return;
        onAdd(title);
        form.reset();
      }}
      className="flex items-center gap-2 p-3"
    >
      <Input
        name="title"
        aria-label="New to-do"
        placeholder="What needs doing?"
        autoComplete="off"
        disabled={!ready}
        className="h-9 flex-1 text-base sm:text-sm"
      />
      <Button type="submit" disabled={!ready} className="px-4">
        Add
      </Button>
    </form>
  );
}
