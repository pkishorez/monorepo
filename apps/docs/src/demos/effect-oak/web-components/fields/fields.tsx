import { Input } from '@kstackz/web-platform/components/input';
import { Label } from '@kstackz/web-platform/components/label';
import { colorOf } from '../elements/index.js';

/*
 * The designer's controls and its preview. The color fields draw the
 * hand-made `<oak-color-picker>`, whose `color-changed` events become the
 * Messages the caller Sends; the preview draws `<oak-pixel-badge>` from the
 * Model. The two elements never touch: they meet in the Model.
 */

const PRESETS = [
  '#1e1b4b',
  '#9d174d',
  '#0f766e',
  '#b45309',
  '#fef3c7',
  '#ffffff',
] as const;

const LABEL =
  'text-xs font-semibold tracking-wide text-muted-foreground uppercase';

export const ContentField = ({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="pattern-content" className={LABEL}>
      Encoded value
    </Label>
    <Input
      id="pattern-content"
      value={value}
      placeholder="https://foldkit.dev"
      onChange={(event) => onChange(event.target.value)}
    />
    <p className="text-xs text-muted-foreground">
      Any text: each one draws its own pattern.
    </p>
  </div>
);

export const ColorField = ({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) => (
  <div className="flex flex-col gap-1.5">
    <span id={`${id}-label`} className={LABEL}>
      {label}
    </span>
    <div className="flex items-center gap-3">
      <oak-color-picker
        id={id}
        color={value}
        oncolor-changed={(event) => onChange(colorOf(event))}
      />
      <div className="flex flex-col gap-1">
        <span className="font-mono text-sm">{value.toUpperCase()}</span>
        <div className="flex max-w-40 flex-wrap gap-1.5">
          {PRESETS.map((color) => {
            const active = color === value.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={`Use ${color} for ${label.toLowerCase()}`}
                className={`size-5 rounded-full transition ${active ? 'border-2 border-primary shadow-sm' : 'border hover:border-foreground'}`}
                style={{ backgroundColor: color }}
                onClick={() => onChange(color)}
              />
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

const SIZE = 220;

export const Preview = ({
  value,
  fill,
  background,
}: {
  readonly value: string;
  readonly fill: string;
  readonly background: string;
}) => (
  <div className="flex flex-col items-center gap-3 self-start rounded-md border bg-muted/40 p-4">
    <oak-pixel-badge
      value={value}
      fill={fill}
      background={background}
      size={SIZE}
    />
    <p className="max-w-56 text-center text-xs text-muted-foreground">
      A live <code>&lt;oak-pixel-badge&gt;</code>: React sets its properties
      when the Model changes, and it redraws its canvas.
    </p>
  </div>
);
