import { Card, CardContent } from '@kestack/web-platform/components/card';
import type { Routes } from '../../../../shared/index.ts';
import { PageFrame } from '../../../components/index.ts';

type PrefsInput = typeof Routes.Account.Settings.input.Type;

/** The account's settings: dynamic like the account, their Loader run at the same time. */
export const Settings = (_props: unknown, prefs: PrefsInput) => (
  <PageFrame
    place="Account.Settings"
    loadedAt={prefs.loadedAt}
    title="Settings"
  >
    <Card className="max-w-md">
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{prefs.email}</dd>
          <dt className="text-muted-foreground">Newsletter</dt>
          <dd>{prefs.newsletter ? 'Yes' : 'No'}</dd>
          <dt className="text-muted-foreground">Language</dt>
          <dd>{prefs.language}</dd>
        </dl>
      </CardContent>
    </Card>
  </PageFrame>
);
