import { serializeV5 } from '../../lib/v5/serialize';
import { FixtureCanvas } from '../shared/canvas';
import {
  documentReviewMachine,
  mediaPlayerMachine,
  orderMachine,
  releaseMachine,
  trafficLightMachine,
  uploadMachine,
} from './machines';

const trafficLight = serializeV5(trafficLightMachine);
const order = serializeV5(orderMachine);
const upload = serializeV5(uploadMachine);
const mediaPlayer = serializeV5(mediaPlayerMachine);
const documentReview = serializeV5(documentReviewMachine);
const release = serializeV5(releaseMachine);

export default {
  '01 simple cycle': <FixtureCanvas machine={trafficLight} />,
  '02 branching workflow': <FixtureCanvas machine={order} />,
  '03 retries and self loops': <FixtureCanvas machine={upload} />,
  '04 hierarchical states': <FixtureCanvas machine={mediaPlayer} />,
  '05 parallel review': <FixtureCanvas machine={documentReview} />,
  '06 nested release workflow': <FixtureCanvas machine={release} />,
  '07 active state focus': (
    <FixtureCanvas
      machine={order}
      focus={{ mode: 'active-state', value: 'charging' }}
      defaults={{ pan: true, zoom: true }}
    />
  ),
};
