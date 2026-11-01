import {
  Drawer,
  LayerHeader,
} from '@kestack/web-platform/recipes/touch-layers';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ArrowLeftIcon,
  ClipboardPasteIcon,
  ImageIcon,
  MessageCircleQuestionIcon,
  MicIcon,
  PaperclipIcon,
  PlusIcon,
  SquareSlashIcon,
} from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { notify } from '../../../../../../../../../../ui/controls/notice/index.ts';

/*
 * Add: one button, and a Drawer of what else can go into the Draft, each
 * row its icon, what it does and one line more. In a Session, first, By
 * the way, to ask about it on the side, or back to the message. A Skill, where Skills
 * go in; Paste, which reads the clipboard in the tap, as iOS
 * needs to show its own Paste bubble, and says so quietly when it may
 * not; a file and a photo, where files go in; and the Microphone Picker. The file fields stay
 * outside the Drawer, so a file picked after it closed still arrives.
 */

/** Reads the clipboard, in the tap that asks; refused, it says so quietly. */
export const paste = (onText: (text: string) => void) =>
  navigator.clipboard.readText().then(
    (text) => {
      if (text !== '') onText(text);
    },
    () =>
      notify({
        title: "Couldn't paste",
        description: 'Allow Code to read the clipboard, then try again.',
        seconds: 4,
      }),
  );

export function Add({
  disabled,
  onSkill,
  onPaste,
  onFiles,
  onChooseMicrophone,
  btw,
  className,
}: {
  readonly disabled: boolean;
  /** Opens the skills Picker; null where none go in, as a Btw. */
  readonly onSkill: (() => void) | null;
  readonly onPaste: (text: string) => void;
  /** Takes files; null where none go in, as a Btw. */
  readonly onFiles: ((files: ReadonlyArray<File>) => void) | null;
  readonly onChooseMicrophone: (() => void) | undefined;
  /** Btw mode, in a Session's Draft: whether it is on, and its switch. */
  readonly btw: { readonly on: boolean; readonly onToggle: () => void } | null;
  /** The trigger's look, as the row beside it draws its buttons. */
  readonly className: string;
}) {
  const [open, setOpen] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const pick = (input: RefObject<HTMLInputElement | null>) => {
    input.current?.click();
    setOpen(false);
  };
  const field = (ref: RefObject<HTMLInputElement | null>, accept?: string) => (
    <input
      ref={ref}
      type="file"
      multiple
      hidden
      tabIndex={-1}
      {...(accept === undefined ? {} : { accept })}
      onChange={(event) => {
        onFiles?.([...(event.currentTarget.files ?? [])]);
        event.currentTarget.value = '';
      }}
    />
  );
  return (
    <>
      {field(files)}
      {field(photos, 'image/*')}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Add"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={className}
      >
        <PlusIcon aria-hidden />
      </Button>
      <Drawer open={open} onOpenChange={(next) => setOpen(next)} label="Add">
        <LayerHeader title="Add" />
        <div className="flex flex-col pb-2">
          {btw !== null && (
            <Row
              icon={btw.on ? <ArrowLeftIcon /> : <MessageCircleQuestionIcon />}
              detail={
                btw.on
                  ? 'What you send goes to the session again'
                  : 'Ask about this session without interrupting it'
              }
              onClick={() => {
                setOpen(false);
                btw.onToggle();
              }}
            >
              {btw.on ? 'Back to the message' : 'By the way'}
            </Row>
          )}
          {onSkill !== null && (
            <Row
              icon={<SquareSlashIcon />}
              detail="Or type / in the message"
              onClick={() => {
                setOpen(false);
                onSkill();
              }}
            >
              Skill
            </Row>
          )}
          <Row
            icon={<ClipboardPasteIcon />}
            detail="What you copied, where you left off"
            onClick={() => {
              setOpen(false);
              void paste(onPaste);
            }}
          >
            Paste
          </Row>
          {onFiles !== null && (
            <>
              <Row
                icon={<PaperclipIcon />}
                detail="Any file, sent with the message"
                onClick={() => pick(files)}
              >
                Attach a file
              </Row>
              <Row
                icon={<ImageIcon />}
                detail="From your photos, or the camera"
                onClick={() => pick(photos)}
              >
                Photo
              </Row>
            </>
          )}
          {onChooseMicrophone !== undefined && (
            <Row
              icon={<MicIcon />}
              detail="Which one Dictations record from"
              onClick={() => {
                setOpen(false);
                onChooseMicrophone();
              }}
            >
              Microphone
            </Row>
          )}
        </div>
      </Drawer>
    </>
  );
}

function Row({
  icon,
  detail,
  onClick,
  children,
}: {
  readonly icon: ReactNode;
  /** The one line under it. */
  readonly detail: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-4 px-5 py-2 text-left transition-colors duration-150 active:bg-muted motion-reduce:transition-none [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
    >
      {icon}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base leading-6">{children}</span>
        <span className="truncate text-sm leading-5 text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  );
}
