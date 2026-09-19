import { Check } from 'lucide-react';

export type ScopeDescriptions = Readonly<Record<string, string>>;

const STANDARD_SCOPES: ScopeDescriptions = {
  openid: 'Know who you are',
  profile: 'See your name and picture',
  email: 'See your email address',
  offline_access: 'Keep access when you are not present',
};

export const describeScope = (scope: string, descriptions: ScopeDescriptions) =>
  descriptions[scope] ?? STANDARD_SCOPES[scope] ?? scope;

export function ScopeList({
  requested,
  descriptions,
}: {
  requested: ReadonlyArray<string>;
  descriptions: ScopeDescriptions;
}) {
  if (requested.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        It only needs to know who you are.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border/60 rounded-lg ring-1 ring-foreground/10 text-sm">
      {requested.map((scope) => (
        <li key={scope} className="flex items-start gap-3 px-3.5 py-3">
          <Check
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span>{describeScope(scope, descriptions)}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {scope}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
