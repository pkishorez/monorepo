import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  Weather,
  WeatherView,
  OpenMeteoLive,
} from '@/demos/effect-oak/weather';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its Forecast: Open-Meteo, a public API with no key. */
const App = toReact(Weather, WeatherView, OpenMeteoLive);

export const Route = createFileRoute('/demos/effect-oak/weather')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
