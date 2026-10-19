import { View } from '@kestack/kabuki/react';
import { Page } from '@kestack/kabuki/routing';
import { Settings } from '../../../shared/pages/index.ts';
import { GitHubReturnNotice } from '../../connect-github/index.ts';
import { ConnectionsLive, ConnectionsView } from './connections/index.ts';
import { CredentialsLive, CredentialsView } from './credentials/index.ts';

/*
 * Settings, as it behaves: a heading and its sections, one Child each, each
 * handed its share of the data the page was drawn with and following its
 * own live. A section joins as one more Child here and one more View below.
 */

export const SettingsLive = Page.build(Settings, {
  children: {
    connections: {
      actor: ConnectionsLive,
      props: ({ props }) => ({
        drawn:
          props.status._tag === 'Ready' ? props.status.data.connections : null,
      }),
    },
    credentials: {
      actor: CredentialsLive,
      props: ({ props }) => ({
        drawn:
          props.status._tag === 'Ready' ? props.status.data.credentials : null,
      }),
    },
  },
});

export const SettingsView = View.make(
  SettingsLive,
  ({ props, children, root }) => (
    <div {...root} className="flex max-w-3xl flex-col gap-10 py-10 sm:py-16">
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Settings
        </h1>
        <GitHubReturnNotice github={props.query.github} />
      </div>
      <ConnectionsView instance={children.connections} />
      <CredentialsView instance={children.credentials} />
    </div>
  ),
);
