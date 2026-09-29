import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Checklist,
  Code,
  Notice,
  Page,
  Playground,
} from '../components/index.ts';
import { SIDEBAR_DEFAULTS, SidebarDemo, sidebarCode } from './-demos/index.ts';

export const Route = createFileRoute('/gestures/sidebar')({
  component: Sidebar,
});

function Sidebar() {
  const [options, setOptions] = useState(SIDEBAR_DEFAULTS);
  return (
    <Page
      path="/gestures/sidebar"
      testId="scenario-sidebar"
      lede={
        <p>
          A drawer that follows your finger from the first few pixels, then
          settles open or closed by where your momentum would carry it. Swipe
          sideways on the phone.
        </p>
      }
    >
      <Playground gestures testId="sidebar-playground">
        <SidebarDemo options={options} onOptions={setOptions} />
      </Playground>
      <Code title="Sidebar" code={sidebarCode(options)} />
      <Notice
        items={[
          'A quick flick opens it from a few pixels: it settles by where the release was headed, not where the finger stopped.',
          'Scrolling the list never moves it. A mostly vertical first movement belongs to the list.',
          <>
            This app’s own menu is the same hook with <code>edge: 24</code>: on
            a phone, swipe in from the left edge of the screen.
          </>,
        ]}
      />
      <Checklist
        steps={[
          'Swipe right anywhere on the list, slowly, past half the sidebar’s width, then lift. It opens.',
          'Swipe right a little and lift slowly. It springs back closed.',
          'Flick right a short way, fast. It opens anyway.',
          'Scroll the list up and down. It never moves.',
          'With it open, swipe back from anywhere: on the sidebar or on the dimmed list.',
          'Drag it most of the way open, then back a little, and lift while moving back. It closes.',
          'Tap the menu button and grab the sidebar while it is still moving. It stops and follows your finger.',
          'Flick it open as hard as you can. It stops dead at fully open, with no bounce past its edge.',
          'Switch the side and the width, and turn swipes off: only the button moves it then.',
        ]}
      />
    </Page>
  );
}
