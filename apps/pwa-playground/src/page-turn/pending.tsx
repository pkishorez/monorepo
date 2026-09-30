import { useRouter } from '@tanstack/react-router';
import {
  Component,
  type ComponentType,
  createContext,
  type ReactNode,
} from 'react';

/** True inside a loading screen drawn for a page that is not the current one. */
export const Pending = createContext(false);

type Fallback = { readonly children: ReactNode; readonly fallback: ReactNode };

// A loading screen that reads its route's data or search throws here, where
// that route is not the current one; show the router's default instead.
class Guard extends Component<Fallback, { readonly failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The loading screen the route at `to` declares (its `pendingComponent`), or
 * the router's `defaultPendingComponent`: what that page shows while it loads,
 * drawn before the router has gone there.
 */
export function PendingPage(props: { readonly to: string }) {
  const router = useRouter();
  const [branch] = router.getMatchedRoutes(props.to);
  const own = branch.at(-1)?.options.pendingComponent as
    | ComponentType
    | undefined;
  const Default = router.options.defaultPendingComponent as
    | ComponentType
    | undefined;
  const Page = own ?? Default;
  if (Page === undefined) return null;
  return (
    <Pending value>
      <Guard
        fallback={
          Default === undefined || Page === Default ? null : <Default />
        }
      >
        <Page />
      </Guard>
    </Pending>
  );
}
