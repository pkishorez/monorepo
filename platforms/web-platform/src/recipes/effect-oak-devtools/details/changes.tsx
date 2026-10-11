import { pathName } from '../step/index.ts';
import type { Field, Row } from '../step/index.ts';
import { Diff, Move } from './value.tsx';
import { Who } from './who.tsx';
import { WorkerTags } from './workers.tsx';

/** What the Step changed, one Instance at a time: its State, its fields, and the Workers it started or stopped. */
export const Changes = ({ rows }: { readonly rows: ReadonlyArray<Row> }) => (
  <ul className="flex flex-col gap-3">
    {rows.map((row) => {
      const workers = row.workers.filter((worker) => worker.life !== 'kept');
      return (
        <li key={row.instance.id} className="flex flex-col gap-1">
          <Who row={row} />
          {(row.transition || row.fields.length > 0 || workers.length > 0) && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 border-l pl-3 text-xs">
              {row.transition && (
                <>
                  <dt className="text-muted-foreground">State</dt>
                  <dd className="min-w-0">
                    <Move {...row.transition} />
                  </dd>
                </>
              )}
              {row.fields.map((field) => (
                <FieldLine
                  key={`${field.in}:${pathName(field.path)}`}
                  field={field}
                  state={row.instance.state._tag}
                />
              ))}
              {workers.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Workers</dt>
                  <dd className="min-w-0">
                    <WorkerTags workers={workers} />
                  </dd>
                </>
              )}
            </dl>
          )}
        </li>
      );
    })}
  </ul>
);

const FieldLine = ({
  field,
  state,
}: {
  readonly field: Field;
  readonly state: string;
}) => (
  <>
    <dt className="font-mono text-muted-foreground">
      {field.in === 'state' && <span className="opacity-60">{state} · </span>}
      {field.in === 'props' && <span className="opacity-60">props · </span>}
      {pathName(field.path) || field.in}
    </dt>
    <dd className="min-w-0">
      <Diff field={field} />
    </dd>
  </>
);
