/** Console's name, as every screen opens with it. */
export function Brand() {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span aria-hidden className="size-2.5 rounded-full bg-foreground" />
      Alchemy Console
    </p>
  );
}
