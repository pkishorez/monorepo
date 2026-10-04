import { BindingKeys } from './binding-keys.tsx';
import { keys } from './keys.ts';

/**
 * The Sequence under way with every way to finish it, or the keys for
 * help and the palette: the user's own when they have any.
 */
export function StatusBar() {
  const { sequence, actions } = keys.useStatus();
  const hint = (id: string) =>
    actions.find((action) => action.id === id)?.bindings[0]?.binding;
  const help = hint('help');
  const palette = hint('commands');
  return (
    <footer className="flex h-10 items-center gap-4 border-t border-border px-4 text-xs text-muted-foreground">
      {sequence.type === 'possible' ? (
        <span className="flex items-center gap-3 text-foreground">
          {sequence.pressed.map((step, i) => (
            <BindingKeys key={i} binding={step} />
          ))}
          …
          {sequence.next.map((next) => (
            <span key={next.id} className="flex items-center gap-1">
              <BindingKeys binding={next.step} /> {next.description}
            </span>
          ))}
        </span>
      ) : (
        <span className="ml-auto flex items-center gap-3">
          {help && (
            <span className="flex items-center gap-1">
              <BindingKeys binding={help} /> every key
            </span>
          )}
          {palette && (
            <span className="flex items-center gap-1">
              <BindingKeys binding={palette} /> commands
            </span>
          )}
        </span>
      )}
    </footer>
  );
}
