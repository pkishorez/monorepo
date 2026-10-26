import { Home as page, HomeLive } from './actor.ts';
import { HomeReady, HomeView } from './view.tsx';

export const Home = { page, actor: HomeLive, view: HomeView, ready: HomeReady };
