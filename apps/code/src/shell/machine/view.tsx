import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import * as places from '../../places/index.ts';
import { OnMachine } from '../connection/index.ts';
import { MachineLive } from './actor.ts';
import * as ProjectPage from './project/index.ts';

/*
 * The pages on one Machine, with the Machine they are on handed to every
 * View under them; a Machine the Backend no longer lists says so in their
 * place.
 */

const link =
  'text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground';

export const MachineView = View.make(
  MachineLive,
  ({ root, model, props, children }) => (
    <OnMachine value={props.params.machineId}>
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        {model.gone ? (
          <p className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
            This Machine is not one of yours any more: it was forgotten, or you
            are signed in as someone else.{' '}
            <Router.Link to={places.home()} className={link}>
              Go to your projects
            </Router.Link>
          </p>
        ) : children.Project ? (
          <ProjectPage.View instance={children.Project} />
        ) : (
          <p className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
            Nothing lives at this address.{' '}
            <Router.Link to={places.home()} className={link}>
              Go to your projects
            </Router.Link>
          </p>
        )}
      </div>
    </OnMachine>
  ),
);
