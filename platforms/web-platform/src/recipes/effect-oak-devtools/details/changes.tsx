import { pathName } from '../step/index.ts';
import type { Field, Row } from '../step/index.ts';
import { Diff, Move } from './value.tsx';
import { Who } from './who.tsx';

/** What the Step changed, one Instance at a time. */
export const Changes = ({ rows }: { readonly rows: ReadonlyArray<Row> }) => (
  <ul className="flex flex-col gap-3">
    {rows.map((row) => (
      <li key={row.instance.id} className="flex flex-col gap-1">
        <Who row={row} />
        {(row.transition || row.fields.length > 0) && (
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
          </dl>
        )}
      </li>
    ))}
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
      {pathName(field.path) || field.in}
    </dt>
    <dd className="min-w-0">
      <Diff field={field} />
    </dd>
  </>
);
