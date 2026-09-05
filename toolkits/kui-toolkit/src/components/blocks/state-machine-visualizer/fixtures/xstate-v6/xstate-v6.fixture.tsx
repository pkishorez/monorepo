import { serializeV6 } from '../../lib/v6/serialize';
import { FixtureCanvas } from '../shared/canvas';
import {
  checkoutMachineV6,
  documentReviewMachineV6,
  runtimeChoiceMachineV6,
  trafficLightMachineV6,
} from './machines';

const trafficLight = serializeV6(trafficLightMachineV6);
const checkout = serializeV6(checkoutMachineV6);
const runtimeChoice = serializeV6(runtimeChoiceMachineV6);
const documentReview = serializeV6(documentReviewMachineV6);

export default {
  '01 timeouts and delays': <FixtureCanvas machine={trafficLight} />,
  '02 declarative choice branches': <FixtureCanvas machine={checkout} />,
  '03 choice function (targets unknown until run)': (
    <FixtureCanvas machine={runtimeChoice} />
  ),
  '04 parallel review': <FixtureCanvas machine={documentReview} />,
};
