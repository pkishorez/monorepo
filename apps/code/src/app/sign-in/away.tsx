import { Button } from '@kestack/web-platform/ui/components/button';

/*
 * Why an Account's page draws the sign-in screen in place of the app, and
 * the Accounts it offers to switch to. A tab acts only as the Account
 * active, browser-wide, and never switches by itself: the page says why,
 * and the user chooses.
 *
 * 1. Why       the page's Account was signed out, here or elsewhere;
 *              another tab or app switched to another, or added one; the
 *              link is for an Account signed in here, another active; or
 *              for one not signed in on this browser at all.
 * 2. Accounts  every Account signed in on this browser, the page's own
 *              first if it is one, each to switch to; the one a switch is
 *              making active says so.
 */

/** 1. Why the page's Account is not drawn. */
export type Why =
  /** Not signed in on this browser, nor ever as this page heard. */
  | { readonly _tag: 'NotHere' }
  /** It was signed in here, and is signed out: here or in another tab. */
  | { readonly _tag: 'SignedOut'; readonly email: string }
  /** It was active in this page until another tab or app made another active. */
  | {
      readonly _tag: 'Switched';
      readonly email: string;
      readonly active: string;
    }
  /** The link is for it, signed in here; another is active. */
  | { readonly _tag: 'Other'; readonly email: string; readonly active: string };

/** An Account signed in on this browser, to switch to. */
export interface Choice {
  readonly id: string;
  readonly email: string;
}

/** Why, and the Accounts signed in on this browser. */
export interface Away {
  readonly why: Why;
  readonly accounts: ReadonlyArray<Choice>;
  /** The page's own Account, by id. */
  readonly own: string;
  /** The Account a switch is making active, by id; null for none. */
  readonly switching: string | null;
  /** Whether the Auth Worker has answered: until then, no switch. */
  readonly answered: boolean;
}

/** 1. Why, as the screen says it. */
export const wordsOf = (
  why: Why,
): { readonly title: string; readonly line: string } => {
  switch (why._tag) {
    case 'SignedOut':
      return {
        title: `${why.email} is signed out`,
        line: 'Sign in again to open this page, or choose an Account signed in here.',
      };
    case 'Switched':
      return {
        title: `You switched to ${why.active} elsewhere`,
        line: `This page is ${why.email}'s. Choose it to open it here again.`,
      };
    case 'Other':
      return {
        title: `This link is for ${why.email}`,
        line: `You are using ${why.active}. Choose ${why.email} to open it.`,
      };
    case 'NotHere':
      return {
        title: 'This link is for an Account not signed in here',
        line: 'Sign in as it to open it, or choose an Account signed in here.',
      };
  }
};

/** 2. Accounts: the page's own first, each one a way to switch to it. */
export function AccountList({
  away,
  onChoose,
}: {
  readonly away: Away;
  readonly onChoose: (id: string) => void;
}) {
  const accounts = [...away.accounts].sort(
    (a, b) => Number(b.id === away.own) - Number(a.id === away.own),
  );
  return (
    <section className="flex flex-col gap-2 text-left">
      <h2 className="text-xs font-medium text-muted-foreground">
        Signed in on this browser
      </h2>
      <ul className="flex flex-col gap-2">
        {accounts.map(({ id, email }) => (
          <li key={id}>
            <Button
              size="lg"
              variant="outline"
              className="w-full justify-start truncate"
              disabled={!away.answered || away.switching !== null}
              onClick={() => onChoose(id)}
            >
              {away.switching === id ? `Switching to ${email}…` : email}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
