import {
  Database,
  KeyRound,
  Pencil,
  Play,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import type {
  TableAccessPatternSnapshot,
  TableEntitySnapshot,
} from 'std-toolkit/snapshot';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '#components/ui/popover';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';

import {
  QueryModel,
  type QueryCriteria,
  type QueryOperator,
} from '../query-model';

const operators: readonly {
  readonly value: QueryOperator;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: 'all',
    label: 'Any sort key',
    description: 'Return every item in the partition',
  },
  { value: '=', label: 'Equal to (=)', description: 'Match one exact key' },
  {
    value: 'beginsWith',
    label: 'Begins with',
    description: 'Match a key prefix',
  },
  { value: '<', label: 'Less than (<)', description: 'Items before this key' },
  {
    value: '<=',
    label: 'Less than or equal (≤)',
    description: 'Items up to this key',
  },
  {
    value: '>',
    label: 'Greater than (>)',
    description: 'Items after this key',
  },
  {
    value: '>=',
    label: 'Greater than or equal (≥)',
    description: 'Items from this key onward',
  },
  { value: 'between', label: 'Between', description: 'Items in a key range' },
];

const patternKinds = ['primary', 'lsi', 'gsi'] as const;

const kindLabel = {
  primary: 'Primary index',
  lsi: 'Local secondary indexes',
  gsi: 'Global secondary indexes',
} as const;

const shortKindLabel = {
  primary: 'Primary',
  lsi: 'LSI',
  gsi: 'GSI',
} as const;

function KeyInputs({
  keys,
  values,
  disabled,
  onChange,
}: {
  readonly keys: readonly string[];
  readonly values: Readonly<Record<string, string>>;
  readonly disabled?: boolean;
  readonly onChange: (key: string, value: string) => void;
}) {
  if (keys.length === 0) return null;
  return (
    <fieldset
      className={
        keys.length > 1 ? 'grid gap-2 min-[560px]:grid-cols-2' : 'grid gap-2'
      }
      disabled={disabled}
    >
      {keys.map((key) => (
        <label key={key} className="grid gap-1.5">
          <span className="font-mono text-xs font-medium text-foreground">
            {key}
          </span>
          <Input
            value={values[key] ?? ''}
            onChange={(event) => onChange(key, event.target.value)}
            placeholder={`Enter ${key}`}
            aria-label={`Key value ${key}`}
          />
        </label>
      ))}
    </fieldset>
  );
}

const keyValues = (
  keys: readonly string[],
  values: Readonly<Record<string, string>>,
) => keys.map((key) => `${key} = ${values[key] ?? ''}`).join(' · ');

const conditionValues = (criteria: QueryCriteria): string => {
  if (criteria.operator === 'all') return 'Any sort key';
  if (criteria.unbounded) return 'Unbounded endpoint';
  if (criteria.operator === 'between') {
    return criteria.pattern.sk
      .map(
        (key) =>
          `${key}: ${criteria.sk[key] ?? ''} … ${criteria.skEnd[key] ?? ''}`,
      )
      .join(' · ');
  }
  const operator =
    criteria.operator === 'beginsWith' ? 'begins with' : criteria.operator;
  return criteria.pattern.sk
    .map((key) => `${key} ${operator} ${criteria.sk[key] ?? ''}`)
    .join(' · ');
};

function AppliedValue({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-1.5 sm:flex">
      <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="min-w-0 break-words font-mono text-xs leading-5">
        {children}
      </span>
    </div>
  );
}

export function QueryBuilder({
  entities,
  selectedEntity,
  criteria,
  running,
  stale,
  onApply,
  onRun,
  onRefresh,
}: {
  readonly entities: readonly TableEntitySnapshot[];
  readonly selectedEntity?: TableEntitySnapshot;
  readonly criteria?: QueryCriteria;
  readonly running: boolean;
  readonly stale: boolean;
  readonly onApply: (
    entity: TableEntitySnapshot,
    criteria?: QueryCriteria,
  ) => void;
  readonly onRun: () => void;
  readonly onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftEntity, setDraftEntity] = useState<TableEntitySnapshot>();
  const [draftCriteria, setDraftCriteria] = useState<QueryCriteria>();

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftEntity(selectedEntity);
      setDraftCriteria(criteria);
    }
    setOpen(nextOpen);
  };
  const changeDraft = (next: Partial<QueryCriteria>) => {
    if (draftCriteria !== undefined) {
      setDraftCriteria({ ...draftCriteria, ...next });
    }
  };
  const patternsByKind = (kind: TableAccessPatternSnapshot['kind']) =>
    draftEntity?.accessPatterns.filter((pattern) => pattern.kind === kind) ??
    [];
  const selectedOperator = operators.find(
    ({ value }) => value === draftCriteria?.operator,
  );
  const canApply =
    draftEntity !== undefined &&
    (draftEntity.kind === 'single' ||
      (draftCriteria !== undefined && QueryModel.canRun(draftCriteria)));
  const applyDraft = () => {
    if (!canApply || draftEntity === undefined) return;
    onApply(draftEntity, draftCriteria);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <section className="sticky top-0 z-30 grid min-h-16 gap-2 rounded-xl border bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        {selectedEntity === undefined ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">No query configured</p>
                <p className="truncate text-xs text-muted-foreground">
                  Choose an Entity, index, and key values.
                </p>
              </div>
            </div>
            <PopoverTrigger render={<Button type="button" size="sm" />}>
              Configure query
            </PopoverTrigger>
          </>
        ) : (
          <>
            <div className="grid min-w-0 gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Database className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-semibold">
                  {selectedEntity.name}
                </span>

                {criteria === undefined ? (
                  <Badge variant="outline">Single Entity</Badge>
                ) : (
                  <>
                    <Badge>{shortKindLabel[criteria.pattern.kind]}</Badge>
                    <span className="truncate text-xs text-muted-foreground">
                      {criteria.pattern.name}
                      {criteria.pattern.index === undefined
                        ? ''
                        : ` · ${criteria.pattern.index}`}
                    </span>
                  </>
                )}
                {stale && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 text-amber-600 dark:text-amber-400"
                  >
                    Not run
                  </Badge>
                )}
              </div>

              {criteria === undefined ? (
                <span className="text-xs text-muted-foreground">
                  Direct record · no keys required
                </span>
              ) : (
                <div className="grid min-w-0 gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
                  <AppliedValue label="PK">
                    {keyValues(criteria.pattern.pk, criteria.pk)}
                  </AppliedValue>
                  <AppliedValue label="SK">
                    {conditionValues(criteria)}
                  </AppliedValue>
                </div>
              )}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5 border-t pt-2 sm:flex sm:border-t-0 sm:pt-0">
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full sm:w-auto"
                  />
                }
              >
                <Pencil />
                Edit
              </PopoverTrigger>
              {criteria !== undefined && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={onRun}
                  disabled={running}
                >
                  {running ? <Spinner /> : <Play />}
                  Run
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={onRefresh}
                disabled={running}
                aria-label="Refresh query"
                title="Refresh query"
              >
                <RefreshCw />
              </Button>
            </div>
          </>
        )}
      </section>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-black/35 backdrop-blur-[1px] animate-in fade-in-0"
          aria-label="Close query editor"
          onClick={() => setOpen(false)}
        />
      )}

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-[min(720px,calc(100vw-1rem))] gap-0 overflow-hidden p-0"
      >
        <form
          className="flex max-h-[min(680px,var(--available-height))] min-h-0 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            applyDraft();
          }}
        >
          <PopoverHeader className="shrink-0 border-b px-4 py-3">
            <PopoverTitle>Configure query</PopoverTitle>
            <PopoverDescription className="sr-only">
              Select how records should be located, then provide the required
              key values.
            </PopoverDescription>
          </PopoverHeader>

          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3">
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <div className="grid content-start gap-1.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <Database className="size-3.5 text-muted-foreground" />
                  Entity
                </span>
                <Select
                  value={draftEntity?.name ?? ''}
                  onValueChange={(value) => {
                    const entity = entities.find(({ name }) => name === value);
                    setDraftEntity(entity);
                    const primary = entity?.accessPatterns.find(
                      ({ kind }) => kind === 'primary',
                    );
                    setDraftCriteria(
                      entity?.kind === 'keyed' && primary !== undefined
                        ? QueryModel.initialCriteria(
                            entity,
                            primary,
                            criteria?.limit,
                          )
                        : undefined,
                    );
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Entity">
                    <SelectValue placeholder="Select an entity">
                      {draftEntity === undefined
                        ? undefined
                        : `${draftEntity.name} · ${
                            draftEntity.kind === 'single' ? 'Single' : 'Keyed'
                          }`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    {entities.map((entity) => (
                      <SelectItem key={entity.name} value={entity.name}>
                        <span className="font-medium">{entity.name}</span>
                        <Badge variant="outline" className="ml-auto">
                          {entity.kind === 'single' ? 'Single' : 'Keyed'}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {draftCriteria !== undefined && (
                <div className="grid content-start gap-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <KeyRound className="size-3.5 text-muted-foreground" />
                    Access pattern
                  </span>
                  <Select
                    value={draftCriteria.pattern.name}
                    onValueChange={(value) => {
                      const pattern = draftEntity?.accessPatterns.find(
                        ({ name }) => name === value,
                      );
                      if (draftEntity !== undefined && pattern !== undefined) {
                        setDraftCriteria(
                          QueryModel.initialCriteria(
                            draftEntity,
                            pattern,
                            draftCriteria.limit,
                          ),
                        );
                      }
                    }}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label="Access pattern"
                    >
                      <SelectValue>
                        {QueryModel.patternLabel(draftCriteria.pattern)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" className="min-w-80">
                      {patternKinds.map((kind) => {
                        const patterns = patternsByKind(kind);
                        return patterns.length === 0 ? null : (
                          <SelectGroup key={kind}>
                            <SelectLabel>{kindLabel[kind]}</SelectLabel>
                            {patterns.map((pattern) => (
                              <SelectItem
                                key={pattern.name}
                                value={pattern.name}
                              >
                                <span className="font-medium">
                                  {pattern.name}
                                </span>
                                {pattern.index !== undefined && (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {pattern.index}
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {draftEntity?.kind === 'single' && (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                This Entity is loaded directly. It does not need an index or key
                values.
              </div>
            )}

            {draftCriteria !== undefined && (
              <div className="grid items-start gap-3 border-t pt-3 sm:grid-cols-2">
                <div className="grid content-start gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">Partition key</h3>
                    <span className="text-[11px] text-muted-foreground">
                      Exact match required
                    </span>
                  </div>
                  <KeyInputs
                    keys={draftCriteria.pattern.pk}
                    values={draftCriteria.pk}
                    onChange={(key, value) =>
                      changeDraft({
                        pk: QueryModel.updateValue(
                          draftCriteria.pk,
                          key,
                          value,
                        ),
                      })
                    }
                  />
                </div>

                <div className="grid content-start gap-2">
                  <h3 className="text-sm font-semibold">Sort key</h3>
                  <div className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Condition
                    </span>
                    <Select
                      value={draftCriteria.operator}
                      onValueChange={(value) =>
                        changeDraft({
                          operator: (value ?? 'all') as QueryOperator,
                          unbounded: false,
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label="Sort-key condition"
                      >
                        <SelectValue>{selectedOperator?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start">
                        {operators.map((operator) => (
                          <SelectItem
                            key={operator.value}
                            value={operator.value}
                          >
                            <span>{operator.label}</span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {operator.description}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {draftCriteria.operator === 'all' ? (
                    <p className="text-xs text-muted-foreground">
                      Returns every record in the selected partition.
                    </p>
                  ) : (
                    <KeyInputs
                      keys={draftCriteria.pattern.sk}
                      values={draftCriteria.sk}
                      disabled={draftCriteria.unbounded}
                      onChange={(key, value) =>
                        changeDraft({
                          sk: QueryModel.updateValue(
                            draftCriteria.sk,
                            key,
                            value,
                          ),
                        })
                      }
                    />
                  )}

                  {draftCriteria.operator === 'between' && (
                    <div className="grid gap-2 border-t pt-3">
                      <p className="text-xs font-semibold">End of range</p>
                      <KeyInputs
                        keys={draftCriteria.pattern.sk}
                        values={draftCriteria.skEnd}
                        onChange={(key, value) =>
                          changeDraft({
                            skEnd: QueryModel.updateValue(
                              draftCriteria.skEnd,
                              key,
                              value,
                            ),
                          })
                        }
                      />
                    </div>
                  )}

                  {QueryModel.canBeUnbounded(draftCriteria.operator) && (
                    <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={draftCriteria.unbounded}
                        onCheckedChange={(checked) =>
                          changeDraft({ unbounded: checked === true })
                        }
                      />
                      Use an unbounded endpoint
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-t px-3 py-2.5 sm:flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canApply}>
              Apply & run
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
