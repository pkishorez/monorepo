// An app that writes nothing but its app: no Document, no Loaders.
import { Start } from '../../../common/index.ts';
import { AppView } from '../../app/src/app.tsx';
import { router } from '../../app/src/routes.ts';

export default Start.app({ router, view: AppView });
