import { View } from '@kestack/kabuki/react';
import { Case } from '../../../parts/index.ts';
import { ProfileLive } from './profile.ts';

export const ProfileView = View.make(ProfileLive, ({ model, send, root }) => (
  <div {...root} className="flex flex-col gap-4">
    <label className="flex max-w-xs flex-col gap-1.5 text-[13px] font-medium">
      Name
      <input
        value={model.name}
        onChange={(event) =>
          send({ _tag: 'Renamed', name: event.target.value })
        }
        className="h-9 rounded-lg border border-border bg-background px-3 text-base font-normal outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring sm:text-[13px]"
      />
    </label>
    <Case title="A page's state is its own">
      Change the name, go to Billing and come back: the draft is gone, because
      leaving a page stops its Actor. What must outlive a page belongs to its
      parent.
    </Case>
  </div>
));
