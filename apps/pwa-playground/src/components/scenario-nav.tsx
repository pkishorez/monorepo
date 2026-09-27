import { Link } from '@tanstack/react-router';
import { SCENARIO_GROUPS, scenarios } from '../lib/scenarios.ts';

const itemClass =
  'relative flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[status=active]:bg-muted/70 data-[status=active]:text-foreground lg:min-h-9';

function NavItem(props: {
  readonly to: string;
  readonly label: string;
  readonly testId: string;
  readonly morph: boolean;
  readonly onNavigate?: () => void;
}) {
  return (
    <Link
      to={props.to}
      className={itemClass}
      data-testid={props.testId}
      activeOptions={{ exact: true, includeSearch: false }}
      onClick={props.onNavigate}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-foreground"
              // One element per page carries the name, so the bar slides to
              // the new item. It sits beside the label, never over it.
              style={props.morph ? { viewTransitionName: 'nav-indicator' } : {}}
            />
          )}
          {props.label}
        </>
      )}
    </Link>
  );
}

/**
 * Every scenario, grouped. `morph` names the active pill for view transitions;
 * `testIdPrefix` keeps the sidebar's and the menu's test ids apart.
 */
export function ScenarioNav(props: {
  readonly morph?: boolean;
  readonly testIdPrefix: string;
  readonly onNavigate?: () => void;
}) {
  const morph = props.morph ?? false;
  const prefix = props.testIdPrefix;
  return (
    <nav aria-label="Scenarios" className="flex flex-col gap-5">
      <NavItem
        to="/"
        label="Overview"
        testId={`${prefix}-overview`}
        morph={morph}
        onNavigate={props.onNavigate}
      />
      {SCENARIO_GROUPS.map((group) => (
        <div key={group} className="flex flex-col gap-0.5">
          <h2 className="px-3 pb-1 font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            {group}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {scenarios
              .filter((s) => s.group === group)
              .map((s) => (
                <li key={s.path}>
                  <NavItem
                    to={s.path}
                    label={s.title}
                    testId={`${prefix}-${s.path.slice(1)}`}
                    morph={morph}
                    onNavigate={props.onNavigate}
                  />
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
