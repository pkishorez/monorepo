import { View } from '../../../../react/index.ts';
import { LabActor } from './app.tsx';

export default View.make(LabActor, () => <p>the lab, loaded lazily</p>);
