export type Screen = 'home' | 'login' | 'consent' | 'device';

export type Visitor = 'unknown' | 'signed-in' | 'signed-out';

export type Route =
  | { kind: 'wait' }
  | { kind: 'show' }
  | { kind: 'go'; to: string };

interface Location {
  pathname: string;
  search: string;
}

export const RETURN_TO = 'return_to';

const sameOriginPath = (value: string | null) =>
  value?.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : undefined;

export const returnDestination = (search: string) =>
  sameOriginPath(new URLSearchParams(search).get(RETURN_TO)) ?? '/';

const loginReturningTo = ({ pathname, search }: Location) =>
  `/login?${new URLSearchParams({ [RETURN_TO]: pathname + search }).toString()}`;

export const routeFor = (
  screen: Screen,
  visitor: Visitor,
  location: Location,
): Route => {
  if (visitor === 'unknown') return { kind: 'wait' };
  if (screen === 'login') {
    const continuing = new URLSearchParams(location.search).has('client_id');
    return visitor === 'signed-out' || continuing
      ? { kind: 'show' }
      : { kind: 'go', to: returnDestination(location.search) };
  }
  if (visitor === 'signed-in') return { kind: 'show' };
  return {
    kind: 'go',
    to: screen === 'home' ? '/login' : loginReturningTo(location),
  };
};
