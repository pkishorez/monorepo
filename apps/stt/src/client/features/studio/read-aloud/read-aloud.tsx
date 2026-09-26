import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from 'kui-toolkit/components/ui/dialog';
import { Progress } from 'kui-toolkit/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from 'kui-toolkit/components/ui/select';
import { Spinner } from 'kui-toolkit/components/ui/spinner';
import { Play, Square, Volume2 } from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/utils';
import {
  defaultVoice,
  sentencesOf,
  voices,
  type VoiceId,
} from '../../../../engine/synthesizer/index.ts';
import {
  usePlayback,
  useVoiceModel,
  type VoiceModel,
} from './synthesis-hooks.ts';

const accents = ['American', 'British'] as const;

const voiceItems = voices.map((voice) => ({
  value: voice.id,
  label: voice.name,
}));

function VoiceSelect({
  voice,
  onChange,
  disabled,
}: {
  readonly voice: VoiceId;
  readonly onChange: (voice: VoiceId) => void;
  readonly disabled: boolean;
}) {
  return (
    <Select
      items={voiceItems}
      value={voice}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger className="min-w-36" aria-label="Voice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {accents.map((accent) => (
          <SelectGroup key={accent}>
            <SelectLabel>{accent}</SelectLabel>
            {voices
              .filter((entry) => entry.accent === accent)
              .map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                  <span className="text-muted-foreground">{entry.gender}</span>
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

const megabytes = (bytes: number): string => (bytes / 1_000_000).toFixed(0);

function ModelStatus({ model }: { readonly model: VoiceModel }) {
  if (model.status === 'error') {
    return (
      <p role="alert" className="text-destructive">
        The voice model did not load: {model.message}
      </p>
    );
  }
  if (model.status === 'ready') return null;
  const percent = model.total > 0 ? (model.loaded / model.total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <Progress value={percent} />
      <p className="text-xs text-muted-foreground tabular-nums">
        Loading the voice model
        {model.total > 0
          ? `, ${megabytes(model.loaded)} of ${megabytes(model.total)} MB`
          : ''}
      </p>
    </div>
  );
}

/** The sentences, with the one being heard lit and kept in view. */
function Sentences({
  sentences,
  current,
}: {
  readonly sentences: ReadonlyArray<string>;
  readonly current: number | null;
}) {
  const currentRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [current]);
  return (
    <p className="max-h-64 overflow-auto rounded-md bg-muted/60 p-3 text-base leading-7 text-pretty">
      {sentences.map((sentence, index) => (
        <span
          key={index}
          ref={index === current ? currentRef : null}
          className={cn(
            'rounded-sm transition-colors duration-300 ease-out',
            current === null
              ? 'text-foreground'
              : index === current
                ? 'bg-primary/15 text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {sentence}{' '}
        </span>
      ))}
    </p>
  );
}

/** Mounted only while the dialog is open: loads the model, owns the audio. */
function Reader({
  text,
  voice,
  onVoiceChange,
}: {
  readonly text: string;
  readonly voice: VoiceId;
  readonly onVoiceChange: (voice: VoiceId) => void;
}) {
  const sentences = useMemo(() => sentencesOf(text), [text]);
  const model = useVoiceModel();
  const playback = usePlayback();
  const ready = model.status === 'ready';
  const waiting = playback.playing && playback.sentence === null;

  return (
    <div className="space-y-4">
      <Sentences sentences={sentences} current={playback.sentence} />
      <ModelStatus model={model} />
      {playback.error ? (
        <p role="alert" className="text-destructive">
          {playback.error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <VoiceSelect
          voice={voice}
          onChange={onVoiceChange}
          disabled={playback.playing}
        />
        {playback.playing ? (
          <Button
            className="min-w-28"
            variant="outline"
            onClick={playback.stop}
          >
            {waiting ? <Spinner /> : <Square />}
            Stop
          </Button>
        ) : (
          <Button
            className="min-w-28"
            disabled={!ready || sentences.length === 0}
            onClick={() => playback.play(sentences, voice)}
          >
            <Play />
            Play
          </Button>
        )}
      </div>
    </div>
  );
}

/** A button that opens the transcript in a dialog and reads it aloud. */
export function ReadAloud({ text }: { readonly text: string }) {
  const [voice, setVoice] = useState<VoiceId>(defaultVoice);
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Volume2 />
        Read aloud
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Read aloud</DialogTitle>
          <DialogDescription>
            Kokoro reads what you said, in your browser. Context you pressed is
            left out. The voice model is a 92 MB download, kept for next time.
          </DialogDescription>
        </DialogHeader>
        <Reader text={text} voice={voice} onVoiceChange={setVoice} />
      </DialogContent>
    </Dialog>
  );
}
