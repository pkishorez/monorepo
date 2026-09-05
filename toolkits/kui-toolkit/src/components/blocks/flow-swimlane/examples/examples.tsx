import { FlowScenarioView } from './runner';
import { flowScenarios } from './scenarios';

/** Creates one Cosmos fixture entry for every executable Flow scenario. */
export const makeFlowExampleFixtures = () =>
  Object.fromEntries(
    flowScenarios.map((scenario) => [
      scenario.title,
      <FlowScenarioView key={scenario.id} scenario={scenario} />,
    ]),
  );
