import { Link } from '@tanstack/react-router';
import { chapters } from '../lib/chapters.ts';
import { buildLabel, buildPreset, pwaEnabled } from '../lib/build.ts';

const itemClass =
  'relative flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[status=active]:bg-muted data-[status=active]:text-foreground lg:min-h-9';

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
              // the new item during the page's view transition.
              style={props.morph ? { viewTransitionName: 'nav-indicator' } : {}}
            />
          )}
          {props.label}
        </>
      )}
    </Link>
  );
}

const testIdOf = (path: string) =>
  path === '/' ? 'overview' : path.slice(1).replaceAll('/', '-');

/**
 * Every page, by chapter. `morph` names the active bar for view transitions;
 * `testIdPrefix` keeps the sidebar's and the drawer's test ids apart.
 */
export function ChapterNav(props: {
  readonly morph?: boolean;
  readonly testIdPrefix: string;
  readonly onNavigate?: () => void;
}) {
  const morph = props.morph ?? false;
  const prefix = props.testIdPrefix;
  return (
    <nav aria-label="Pages" className="flex flex-col gap-6">
      <NavItem
        to="/"
        label="What is a PWA"
        testId={`${prefix}-overview`}
        morph={morph}
        onNavigate={props.onNavigate}
      />
      {chapters.map((chapter) => (
        <div key={chapter.id} className="flex flex-col gap-0.5">
          <h2 className="px-3 pb-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {chapter.title}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {chapter.pages.map((page) => (
              <li key={page.path}>
                <NavItem
                  to={page.path}
                  label={page.title}
                  testId={`${prefix}-${testIdOf(page.path)}`}
                  morph={morph}
                  onNavigate={props.onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="px-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        <span data-testid={`${prefix}-build-label`}>build {buildLabel}</span>
        {' · '}
        <span>{buildPreset} preset</span>
        {pwaEnabled ? null : (
          <span className="block text-destructive" data-testid="kill-switch">
            Kill Switch build
          </span>
        )}
      </p>
    </nav>
  );
}
