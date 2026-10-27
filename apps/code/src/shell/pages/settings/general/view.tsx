import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { MoonIcon, SunIcon } from '@kestack/web-platform/ui/components/lucide';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { use } from 'react';
import { keys, useBound } from '../../../../keys.ts';
import {
  Choice,
  Row,
  Section,
  Title,
  Toggle,
} from '../../../../ui/settings/index.ts';
import { Theme } from '../../../../ui/theme/index.ts';
import { MicrophonePicker } from '../../../actors/pickers/microphone-picker/index.ts';
import { GeneralLive } from './actor.ts';

/*
 * General: this browser's settings, in Sections. Appearance: the theme,
 * the text size and the window, the last two only with a keyboard on a
 * wide screen. Keyboard: Vim Mode, which a touch screen with no keyboard
 * leaves out. Voice: the Microphone, chosen in the Microphone Picker.
 * Touch: Smart Input and Smart Displacement, which a keyboard leaves out.
 * Each says what it does in a line; a Row of one switch, and the theme's,
 * is clicked anywhere to flip it.
 */

/** A Toggle once Device State is read, a placeholder shaped like one before. */
function OnOff({
  id,
  on,
  onChange,
}: {
  readonly id: string;
  readonly on: boolean | null;
  readonly onChange: (on: boolean) => void;
}) {
  return on === null ? (
    <Skeleton className="h-6 w-10 rounded-full keyboard:h-5 keyboard:w-8" />
  ) : (
    <Toggle labelledBy={`${id}-name`} on={on} onChange={onChange} />
  );
}

/** A key as written, set apart from the words around it. */
function Key({ children }: { readonly children: string }) {
  return (
    <kbd className="rounded border border-border/80 px-1 font-mono text-xs text-foreground/80">
      {children}
    </kbd>
  );
}

/** Vim Mode, kept in this browser: off, the app is worked as any other is. */
function VimSetting() {
  const { vim } = keys.useKeyboard();
  const help = useBound('app.help');
  const toggle = useBound('app.vim');
  return (
    <Row
      id="vim"
      name="Vim mode"
      onToggle={() => vim.set(!vim.on)}
      control={<OnOff id="vim" on={vim.on} onChange={vim.set} />}
    >
      Single keys become shortcuts.
      {help !== null && (
        <>
          {' '}
          <Key>{help}</Key> lists them.
        </>
      )}
      {toggle !== null && (
        <>
          {' '}
          <Key>{toggle}</Key> turns it on and off.
        </>
      )}
    </Row>
  );
}

/** Light or dark, kept in a cookie for this host. */
function ThemeSetting() {
  const { theme, setTheme, toggleTheme } = Theme.useTheme();
  return (
    <Row
      id="theme"
      name="Theme"
      onToggle={toggleTheme}
      control={
        <Choice
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            {
              value: 'light',
              label: (
                <>
                  <SunIcon aria-hidden /> Light
                </>
              ),
            },
            {
              value: 'dark',
              label: (
                <>
                  <MoonIcon aria-hidden /> Dark
                </>
              ),
            },
          ]}
        />
      }
    />
  );
}

export const GeneralView = View.make(GeneralLive, ({ root, model, send }) => {
  const opener = use(MicrophonePicker.Opener);
  const { device } = model;
  return (
    <section
      {...root}
      aria-labelledby="general"
      className="flex flex-col gap-8"
    >
      <Title id="general" name="General">
        Kept in this browser only.
      </Title>
      <Section name="Appearance">
        <ThemeSetting />
        <Row
          id="text-size"
          name="Text size"
          className="max-md:hidden touch:hidden keyboard:md:flex"
          control={
            device === null ? (
              <Skeleton className="h-8 w-48 rounded-lg" />
            ) : (
              <Choice
                label="Text size"
                value={device.textSize}
                onChange={(size) => send({ _tag: 'TextSizeChosen', size })}
                options={[
                  { value: 'small', label: 'Small' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'large', label: 'Large' },
                ]}
              />
            )
          }
        >
          Smaller fits more on screen.
        </Row>
        <Row
          id="floating"
          name="Window"
          onToggle={
            device === null
              ? undefined
              : () => send({ _tag: 'FloatingChosen', on: !device.floating })
          }
          className="max-md:hidden"
          control={
            <OnOff
              id="floating"
              on={device?.floating ?? null}
              onChange={(on) => send({ _tag: 'FloatingChosen', on })}
            />
          }
        >
          Float the app in a window on very wide screens. Nice for demos.
        </Row>
      </Section>
      <Section name="Keyboard" className="touch:hidden keyboard:flex">
        <VimSetting />
      </Section>
      <Section name="Voice">
        <Row
          id="microphone"
          name="Microphone"
          control={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 keyboard:h-8"
              aria-label="Choose the microphone"
              onClick={(event) =>
                opener?.current?.(
                  event.nativeEvent instanceof PointerEvent &&
                    event.nativeEvent.pointerType !== 'mouse' &&
                    event.nativeEvent.pointerType !== ''
                    ? 'touch'
                    : 'keys',
                )
              }
            >
              Choose
            </Button>
          }
        >
          {device === null ? (
            <Skeleton className="mt-1 h-4 w-28" />
          ) : device.microphone === null ? (
            'System default.'
          ) : (
            'The one chosen here, or the system default while it is away.'
          )}
        </Row>
      </Section>
      <Section name="Touch" className="keyboard:hidden">
        <Row
          id="smart-input"
          name="Smart input"
          onToggle={
            device === null
              ? undefined
              : () => send({ _tag: 'SmartInputChosen', on: !device.smartInput })
          }
          control={
            <OnOff
              id="smart-input"
              on={device?.smartInput ?? null}
              onChange={(on) => send({ _tag: 'SmartInputChosen', on })}
            />
          }
        >
          A tap opens the Draft without the keyboard, ready to dictate.
        </Row>
        <Row
          id="smart-displacement"
          name="Smart displacement"
          onToggle={
            device === null
              ? undefined
              : () =>
                  send({
                    _tag: 'SmartDisplacementChosen',
                    on: !device.smartDisplacement,
                  })
          }
          control={
            <OnOff
              id="smart-displacement"
              on={device?.smartDisplacement ?? null}
              onChange={(on) => send({ _tag: 'SmartDisplacementChosen', on })}
            />
          }
        >
          The cursor you drag sits just above your finger.
        </Row>
      </Section>
    </section>
  );
});
