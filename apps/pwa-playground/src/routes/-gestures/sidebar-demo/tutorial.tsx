import { sidebarCode } from '../sidebar/index.ts';
import type { Tutorial } from '../tutorial/index.ts';
import panelCode from './gestures.ts?raw';

export const sidebarTutorial: Tutorial = {
  title: 'Sidebar',
  summary:
    "The lab's own sidebar, and a second panel from the right, with their progress live on screen.",
  tryThis: [
    {
      gesture: 'Swipe right slowly, and stop halfway',
      result:
        'The sidebar follows your finger however slowly. Let go before 40% and it springs back; past it, it springs open.',
    },
    {
      gesture: 'Flick right, however short',
      result:
        'A flick opens it on its own. A flick back closes it, however far it was open.',
    },
    {
      gesture: 'With it open, swipe left or tap the dark scrim',
      result: 'It closes.',
    },
    {
      gesture: 'Touch it while it is still moving',
      result:
        'It stops under your finger; drag on from there, or let go and it carries on.',
    },
    {
      gesture: 'Swipe left',
      result:
        'The right-hand panel opens the same way. Swipe right to close it.',
    },
  ],
  howItWorks: [
    'Both are useSwipe({ edge: true, after: "stay" }): the sidebar on the lab\'s root zone, the panel on this demo\'s nested zone.',
    'Installed on iOS the app owns the screen edges, so an edge Swipe starts only in the 24px strip at its edge ("source: edge"). In a browser tab or on Android the browser or system uses the edges for back, so the app never listens there, and the Swipe starts from anywhere in its zone instead ("source: zone").',
    'That fallback stays off if another hook in the zone chain already takes the same Swipe; the hook reports available: false, and you show a button.',
    "A Swipe right here is not the panel's while it is closed, so it passes out from this zone to the root zone, where the sidebar takes it.",
    'The menu button calls open(); a demo in the sidebar calls close().',
  ],
  code: `${sidebarCode}\n// The right-hand panel, on this demo's zone\n\n${panelCode}`,
  animation: [
    'One progress value per Swipe: 0 closed, 1 open, set on every move.',
    "The sidebar's offset, the scrim's opacity, and the lab behind it moving aside and shrinking a little are all useTransforms of that one value.",
    "On release it springs to 0 or 1, starting at your finger's speed, so a flick lands fast and a slow release lands gently.",
    'A finger landing mid-spring stops it (the value is caught), and a new drag continues from where it is.',
  ],
};
