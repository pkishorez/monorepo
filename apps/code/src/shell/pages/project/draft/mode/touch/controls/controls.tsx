import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ArrowUpIcon,
  AudioLinesIcon,
  CheckIcon,
  MicIcon,
  SquareSlashIcon,
  Trash2Icon,
  TypeIcon,
  XIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { ReactNode } from 'react';
import * as Picker from '../../../../../../../ui/picker/index.ts';
import { QuickActions } from './quick-actions.tsx';
import { Slot } from './slot.tsx';
import { TalkBar, type Recording, type Voice } from './talk-bar.tsx';

/*
 * The Touch Draft's controls: Text | Voice on its top line, and the row
 * under its words, which never moves: two round slots on the left, the
 * talk bar's room in the middle, Send on the right.
 *
 * 1. Slots     Skills and Quick actions at rest; Cancel and the
 *              microphone while one records; Discard and Quick actions
 *              once one failed; editing, the two are one: Done. Each
 *              cross-fades what it holds in place (`slot.tsx`).
 * 2. Talk bar  in voice mode, and not editing (`talk-bar.tsx`); its room
 *              stays, empty, so nothing beside it moves.
 * 3. Send      or, while one records, stop it and send once it is text.
 */

/** A large round button, a thumb's and some. */
const BIG =
  'size-14 shrink-0 rounded-full [&_svg:not([class*=size-])]:size-5.5';
/** The same, quiet: outlined, for what is not the main action. */
const QUIET = cn(
  BIG,
  'border border-border bg-background text-foreground shadow-none hover:bg-muted aria-expanded:bg-muted',
);

/** Keeps focus where it is on a press: the keyboard stays up as Send or Done is pressed. */
const keepFocus = (event: { preventDefault: () => void }) =>
  event.preventDefault();

/** How the Touch Draft is written: by typing, or by voice. */
type Mode = 'text' | 'voice';

export function Row({
  phase,
  voice,
  talking,
  disabled,
  recording,
  skills,
  quick,
  send,
  onCancel,
  onDone,
  onTalk,
}: {
  readonly phase: 'resting' | 'recording' | 'failed' | 'editing';
  readonly voice: Voice;
  /** The talk bar shows: voice mode, not editing. */
  readonly talking: boolean;
  readonly disabled: boolean;
  readonly recording: Recording;
  /** null where none go in, as a Side Question: its button is not drawn. */
  readonly skills: {
    readonly offered: boolean;
    readonly how: typeof Picker.How.Type | null;
    readonly onOpen: (how: typeof Picker.How.Type, typed: boolean) => void;
    readonly picker: ReactNode;
  } | null;
  readonly quick: {
    /** Starts a question on the side; null where there is no Session to ask. */
    readonly onAsk: (() => void) | null;
    readonly onPaste: (text: string) => void;
    /** Takes files; null where none go in, as a Side Question. */
    readonly onFiles: ((files: ReadonlyArray<File>) => void) | null;
    readonly onChooseMicrophone: (() => void) | undefined;
  };
  readonly send: {
    readonly label: string;
    readonly disabled: boolean;
    readonly onSend: () => void;
  };
  /** Throws the Dictation away, recording or failed. */
  readonly onCancel: () => void;
  readonly onDone: () => void;
  readonly onTalk: () => void;
}) {
  const open = Picker.useOpen();
  const quiet = (
    label: string,
    icon: ReactNode,
    onClick: (() => void) | undefined,
    off = false,
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={off}
      onClick={onClick}
      className={QUIET}
    >
      {icon}
    </Button>
  );
  return (
    <div className="flex min-w-0 items-center gap-2 pt-1.5">
      {/* 1. Slots */}
      <Slot
        shown={phase === 'editing' ? 'done' : 'pair'}
        items={{
          pair: (
            <div className="flex gap-2">
              {(skills !== null ||
                phase === 'recording' ||
                phase === 'failed') && (
                <Slot
                  shown={
                    phase === 'recording'
                      ? 'cancel'
                      : phase === 'failed'
                        ? 'discard'
                        : 'skills'
                  }
                  items={{
                    skills:
                      skills === null
                        ? null
                        : quiet(
                            'Add a skill or command',
                            <SquareSlashIcon aria-hidden />,
                            () => open(() => skills.onOpen('touch', false)),
                            disabled || !skills.offered,
                          ),
                    cancel: quiet(
                      'Cancel the Dictation',
                      <XIcon aria-hidden />,
                      onCancel,
                    ),
                    discard: quiet(
                      'Throw the recording away',
                      <Trash2Icon aria-hidden />,
                      onCancel,
                    ),
                  }}
                />
              )}
              <Slot
                shown={phase === 'recording' ? 'microphone' : 'actions'}
                items={{
                  actions: (
                    <QuickActions
                      disabled={disabled}
                      onAsk={quick.onAsk}
                      onPaste={quick.onPaste}
                      onFiles={quick.onFiles}
                      onChooseMicrophone={quick.onChooseMicrophone}
                      className={QUIET}
                    />
                  ),
                  microphone: quiet(
                    'Choose the microphone',
                    <MicIcon aria-hidden />,
                    quick.onChooseMicrophone,
                    quick.onChooseMicrophone === undefined,
                  ),
                }}
              />
            </div>
          ),
          done: (
            <Button
              type="button"
              variant="ghost"
              onMouseDown={keepFocus}
              onClick={onDone}
              className="h-14 w-30 gap-1.5 rounded-full border border-border bg-background text-base font-medium [&_svg:not([class*=size-])]:size-4.5"
            >
              <CheckIcon aria-hidden />
              Done
            </Button>
          ),
        }}
      />
      {/* 2. Talk bar: its room always there. */}
      <div
        data-shown={talking || undefined}
        inert={!talking}
        className={cn(
          'flex min-w-0 flex-1',
          'transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.4,0,1,1)] motion-reduce:transition-none',
          'not-data-shown:pointer-events-none not-data-shown:scale-[0.96] not-data-shown:opacity-0',
          'data-shown:duration-250 data-shown:ease-[cubic-bezier(0.32,0.72,0,1)]',
        )}
      >
        <TalkBar
          voice={voice}
          recording={recording}
          disabled={disabled}
          quiet={voice === 'dictate' && !send.disabled}
          onPress={onTalk}
        />
      </div>
      {/* 3. Send */}
      <Button
        type="button"
        size="icon"
        aria-label={send.label}
        disabled={send.disabled}
        onMouseDown={keepFocus}
        onClick={send.onSend}
        className={cn(
          BIG,
          'transition-[background-color,color,scale] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 motion-reduce:transition-none',
        )}
      >
        <ArrowUpIcon aria-hidden />
      </Button>
      {/* Skills' Sheet, opened from its slot. */}
      {skills !== null && (
        <Picker.Frame how={skills.how} mode="sheet" label="Skills and commands">
          {skills.picker}
        </Picker.Frame>
      )}
    </div>
  );
}

/**
 * Text | Voice as two icons, the button a Swipe on the words stands in
 * for: a screen reader, or anyone who doesn't swipe, switches here.
 */
export function ModeSwitch({
  mode,
  ready,
  onChoose,
  disabled,
}: {
  readonly mode: Mode;
  /** Voice can be had now. */
  readonly ready: boolean;
  readonly onChoose: (mode: Mode) => void;
  readonly disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Write by"
      className="relative inline-flex shrink-0 items-center rounded-full bg-muted p-0.5"
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0.5 left-0.5 w-11 rounded-full bg-background shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
          mode === 'voice' && 'translate-x-11',
        )}
      />
      {(['text', 'voice'] as const).map((each) => (
        <button
          key={each}
          type="button"
          role="radio"
          aria-checked={mode === each}
          aria-label={
            each === 'text' ? 'Text' : ready ? 'Voice' : "Voice, isn't on"
          }
          disabled={disabled}
          onClick={() => onChoose(each)}
          className={cn(
            'focus-ring relative z-10 flex size-11 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-50 [&_svg]:size-5',
            mode === each ? 'text-foreground' : 'text-muted-foreground',
            each === 'voice' && !ready && 'opacity-40',
          )}
        >
          {each === 'text' ? (
            <TypeIcon aria-hidden />
          ) : (
            <AudioLinesIcon aria-hidden />
          )}
        </button>
      ))}
    </div>
  );
}
