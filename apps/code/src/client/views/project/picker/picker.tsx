import type { ModelInfo } from '@kestack/ai-toolkit/api';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@kestack/web-platform/components/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kestack/web-platform/components/dropdown-menu';
import {
  ChevronDownIcon,
  SlidersHorizontalIcon,
} from '@kestack/web-platform/components/lucide';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/components/popover';
import { cn } from '@kestack/web-platform/components/utils';
import { describe, shortcut } from '@kestack/use-keys';
import { Fragment, useState } from 'react';
import { keys, keysOf } from '../../../keys.ts';

/*
 * The two pickers under a composer. One picks the model: for a new
 * session the agents are tabs down its left, and picking one takes its
 * default model while its own list opens on the right; picking a model
 * closes it. A session already running keeps its agent, so it only lists
 * that agent's models. The other holds every setting of the agent, such
 * as effort and permissions, and stays open while they are changed. Both
 * sit in the composer's bottom row and give up their words as it narrows.
 *
 * Mod+Shift+M opens the model picker from the page, even while typing. It is open while
 * the isolated `picker` Surface is Active: arrows and Enter are cmdk's,
 * and Escape clears the search first, then leaves it, which closes it.
 */

const trigger =
  'focus-ring inline-flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground motion-reduce:transition-none';

export interface Agent {
  readonly name: string;
  readonly label: string;
  /** Why it cannot run here; null when it can. */
  readonly unavailable: string | null;
}

export function ModelPicker({
  agents,
  agent,
  onPickAgent,
  value,
  models,
  loading,
  onPick,
}: {
  /** Offered as tabs only when the agent can still be changed. */
  readonly agents?: ReadonlyArray<Agent>;
  readonly agent: Agent;
  readonly onPickAgent?: (name: string) => void;
  readonly value: string;
  readonly models: ReadonlyArray<ModelInfo>;
  readonly loading: boolean;
  readonly onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const { active } = keys.useSurface('picker');
  const { enter, leave } = keys.useKeyboard();
  keys.useAction('content.model', () => enter('picker'));
  keys.useAction('picker.clear', () => setQuery(''), {
    enabled: query !== '',
  });
  const name = models.find(({ id }) => id === value)?.name ?? value;
  return (
    <Popover
      open={active}
      onOpenChange={(next, details) => {
        // Escape goes through the Surface's order instead.
        if (details.reason === 'escape-key') {
          details.cancel();
          details.allowPropagation();
          return;
        }
        if (next) enter('picker');
        else leave('picker');
      }}
    >
      <PopoverTrigger
        aria-label={`Model: ${agents ? `${agent.label}, ` : ''}${name}`}
        title={`Model (${describe(shortcut(keysOf.model))})`}
        className={trigger}
      >
        {agents && (
          <span className="hidden shrink-0 text-muted-foreground/80 @sm/composer:inline">
            {agent.label}
          </span>
        )}
        <span className="truncate text-foreground/90">{name}</span>
        <ChevronDownIcon aria-hidden className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className={cn(
          'flex-row gap-0 overflow-hidden p-0',
          agents ? 'w-[min(26rem,calc(100vw-2rem))]' : 'w-72',
        )}
      >
        <keys.Surface id="picker" asChild onExit={() => setQuery('')}>
          <div className="flex min-w-0 flex-1 flex-row">
            {agents && (
              <div
                role="tablist"
                aria-orientation="vertical"
                aria-label="Agent"
                className="flex w-28 shrink-0 flex-col gap-0.5 border-r border-border bg-muted/40 p-1"
              >
                {agents.map((each) => (
                  <button
                    key={each.name}
                    type="button"
                    role="tab"
                    aria-selected={each.name === agent.name}
                    disabled={each.unavailable !== null}
                    title={each.unavailable ?? undefined}
                    onClick={() => onPickAgent?.(each.name)}
                    className="focus-ring rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:opacity-50 aria-selected:bg-background aria-selected:font-medium aria-selected:text-foreground aria-selected:shadow-xs motion-reduce:transition-none"
                  >
                    {each.label}
                  </button>
                ))}
              </div>
            )}
            <Command
              key={agent.name}
              loop
              className="min-w-0 flex-1 rounded-none!"
              filter={(id, search, keywords) =>
                `${id} ${keywords?.join(' ') ?? ''}`
                  .toLowerCase()
                  .includes(search.toLowerCase())
                  ? 1
                  : 0
              }
              defaultValue={value}
            >
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={`Search ${agent.label} models`}
              />
              <CommandList className="max-h-72">
                <CommandEmpty>
                  {loading ? 'Loading models…' : 'No model by that name'}
                </CommandEmpty>
                {models.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    keywords={[model.name]}
                    data-checked={model.id === value}
                    onSelect={() => {
                      onPick(model.id);
                      leave('picker');
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {model.name}
                    </span>
                    {model.releaseDate && (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {model.releaseDate.slice(0, 7)}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </div>
        </keys.Surface>
      </PopoverContent>
    </Popover>
  );
}

export interface Setting {
  readonly key: string;
  readonly label: string;
  readonly choices: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
}

export function SettingsPicker({
  settings,
  values,
  onPick,
}: {
  readonly settings: ReadonlyArray<Setting>;
  readonly values: Readonly<Record<string, string>>;
  readonly onPick: (key: string, value: string) => void;
}) {
  if (settings.length === 0) return null;
  const summary = settings
    .map(
      (setting) =>
        setting.choices.find(({ value }) => value === values[setting.key])
          ?.label ?? values[setting.key],
    )
    .join(' · ');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Settings: ${summary}`}
        title={summary}
        className={cn(trigger, 'shrink-0 @md/composer:shrink')}
      >
        <SlidersHorizontalIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="hidden truncate text-foreground/90 @md/composer:inline">
          {summary}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-56">
        {settings.map((setting, index) => (
          <Fragment key={setting.key}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{setting.label}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={values[setting.key]}
                onValueChange={(value: string) => onPick(setting.key, value)}
              >
                {setting.choices.map((choice) => (
                  <DropdownMenuRadioItem
                    key={choice.value}
                    value={choice.value}
                    closeOnClick={false}
                  >
                    {choice.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
