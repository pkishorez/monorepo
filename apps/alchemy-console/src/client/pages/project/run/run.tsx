import { View } from '@kestack/kabuki/react';
import { Page } from '@kestack/kabuki/routing';
import { Run } from '../../../../shared/pages/index.ts';
import { RunViewLive, RunViewView } from '../../../run-view/index.ts';

/*
 * One run of a project: the RunView, followed live, for the run the URL
 * names. A new run ID is a new page, so it starts afresh.
 */

export const RunLive = Page.build(Run, {
  children: {
    view: {
      actor: RunViewLive,
      props: ({ props }) => ({ runId: props.params.runId }),
    },
  },
});

export const RunPageView = View.make(RunLive, ({ children, root }) => (
  <div {...root}>
    <RunViewView instance={children.view} />
  </div>
));
