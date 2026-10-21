import type { ModelInfo } from '@kestack/ai-toolkit/api';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@kestack/web-platform/components/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kestack/web-platform/components/select';

/*
 * The two pickers a new session is set up with: a plain one for a few
 * choices, and a searchable one for the models, which are many.
 */

const trigger =
  'h-7 gap-1 rounded-md border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground dark:bg-transparent';

export function Choice({
  label,
  value,
  choices,
  onPick,
  named = false,
}: {
  readonly label: string;
  /** Shows the label before the value, for a setting a value alone does not explain. */
  readonly named?: boolean;
  readonly value: string;
  readonly choices: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
  readonly onPick: (value: string) => void;
}) {
  return (
    <Select
      items={choices}
      value={value}
      onValueChange={(picked) => picked !== null && onPick(picked)}
    >
      <SelectTrigger size="sm" aria-label={label} className={trigger}>
        {named && <span className="text-muted-foreground/70">{label}</span>}
        <SelectValue className="text-foreground/90" />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ModelPicker({
  value,
  models,
  loading,
  onPick,
}: {
  readonly value: string;
  readonly models: ReadonlyArray<ModelInfo>;
  readonly loading: boolean;
  readonly onPick: (id: string) => void;
}) {
  const known = models.find(({ id }) => id === value);
  const items = known
    ? models
    : [{ id: value, name: value, releaseDate: null }, ...models];
  return (
    <Combobox
      items={items}
      value={known ?? items[0]!}
      onValueChange={(picked: ModelInfo | null) => picked && onPick(picked.id)}
      itemToStringLabel={(model: ModelInfo) => model.name}
      itemToStringValue={(model: ModelInfo) => model.id}
    >
      <ComboboxTrigger
        aria-label="Model"
        className={`inline-flex items-center ${trigger}`}
      >
        <span className="text-foreground/90">
          <ComboboxValue />
        </span>
      </ComboboxTrigger>
      <ComboboxContent className="w-72">
        <ComboboxInput placeholder="Search models" showTrigger={false} />
        <ComboboxEmpty>
          {loading ? 'Loading models…' : 'No model by that name'}
        </ComboboxEmpty>
        <ComboboxList>
          {(model: ModelInfo) => (
            <ComboboxItem key={model.id} value={model}>
              <span className="min-w-0 flex-1 truncate">{model.name}</span>
              {model.releaseDate && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {model.releaseDate.slice(0, 7)}
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
