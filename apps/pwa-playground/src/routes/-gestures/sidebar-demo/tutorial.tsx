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
        'The sidebar follows your finger from anywhere unclaimed. Let go before 40% and it settles back; past it, it settles open.',
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
    'Both are useSwipe({ edge: false, after: "stay" }): the sidebar on the lab\'s root zone, the panel on this demo\'s nested zone.',
    'They start anywhere in their zone except the narrow edge strips reserved for the browser or operating system. This avoids depending on iOS back-navigation territory, which a normal web app cannot disable reliably.',
    'Nested zones have priority. The panel takes left Swipes here; an unclaimed right Swipe bubbles to the root sidebar. Other demos keep their own horizontal gestures.',
    "A Swipe right here is not the panel's while it is closed, so it passes out from this zone to the root zone, where the sidebar takes it.",
    'Once either panel commits to closing, it immediately yields that closing direction. This lets the opposite panel begin opening before the first settle finishes.',
    'The menu button calls open(); a demo in the sidebar calls close().',
  ],
  code: `${sidebarCode}\n// The right-hand panel, on this demo's zone\n\n${panelCode}`,
  animation: [
    'One progress value per Swipe: 0 closed, 1 open, set on every move.',
    "The sidebar's offset, the scrim's opacity, and the lab behind it moving aside and shrinking a little are all useTransforms of that one value.",
    "On release it uses a quick, near-critical spring to 0 or 1, seeded with the finger's velocity, so a flick keeps moving and a slow release lands gently without bounce.",
    'A finger landing mid-settle catches it immediately, and a new drag continues from that exact position.',
  ],
};
