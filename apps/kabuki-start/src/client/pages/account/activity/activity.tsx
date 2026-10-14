import { Card, CardContent } from '@kestack/web-platform/components/card';
import type { Routes } from '../../../../shared/index.ts';
import { PageFrame } from '../../../components/index.ts';

type ActivityInput = typeof Routes.Account.Activity.input.Type;

/** The account's activity: a client place, loaded and drawn by the browser alone. */
export const Activity = (_props: unknown, activity: ActivityInput) => (
  <PageFrame
    place="Account.Activity"
    loadedAt={activity.loadedAt}
    title="Activity"
    intro="A client place under a dynamic one: the server drew the account around it, and the browser loaded this."
  >
    <Card className="max-w-md">
      <CardContent>
        <ol className="divide-y divide-border">
          {activity.events.map((event) => (
            <li
              key={event.what}
              className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
            >
              <span>{event.what}</span>
              <span className="text-sm text-muted-foreground">{event.ago}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  </PageFrame>
);
