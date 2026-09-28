import { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Badge } from '@kstackz/ui-toolkit/components/ui/badge';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Kbd } from '@kstackz/ui-toolkit/components/ui/kbd';
import { Textarea } from '@kstackz/ui-toolkit/components/ui/textarea';
import { Pause, Play } from '@kstackz/ui-toolkit/lucide';
import type { defineRound, Media } from './round.ts';

type Round = ReturnType<typeof defineRound>;

const idOf = (path: string) => path.split('/')[2]!;

const live = Object.entries(
  import.meta.glob<{ round: Round }>('./rounds/*/round.tsx', { eager: true }),
).map(([path, module]) => ({ id: idOf(path), ...module.round }));

const picks = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./rounds/*/PICK.md', {
      eager: true,
      query: '?raw',
      import: 'default',
    }),
  ).map(([path, text]) => [idOf(path), text]),
);

// Applied Rounds keep only their PICK.md, so they are listed by it.
const ids = [...new Set([...live.map(({ id }) => id), ...Object.keys(picks)])];
const rounds = ids.sort().map((id) => ({
  id,
  question:
    live.find((round) => round.id === id)?.question ??
    picks[id]!.match(/^# (.+)$/m)?.[1] ??
    id,
}));

function statusOf(id: string) {
  const pick = picks[id];
  if (!pick) return 'open';
  return pick.includes('status: applied') ? 'applied' : 'picked';
}

export function Playground() {
  const [current, setCurrent] = useState(
    () => window.location.hash.slice(1) || rounds.at(-1)?.id,
  );
  const round = live.find(({ id }) => id === current);

  // `pnpm playground <round>` opens the Round by its URL hash.
  useEffect(() => {
    const follow = () => setCurrent(window.location.hash.slice(1));
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);

  function select(id: string) {
    window.location.hash = id;
    setCurrent(id);
  }

  return (
    <div className="flex min-h-screen bg-background font-sans text-foreground">
      <nav className="sticky top-0 h-screen w-64 shrink-0 border-r p-4">
        <h1 className="mb-4 text-sm font-semibold text-muted-foreground">
          Rounds
        </h1>
        {rounds.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No Rounds yet. Start one with /foundation or /explainer.
          </p>
        )}
        {rounds.map(({ id, question }) => (
          <button
            key={id}
            onClick={() => select(id)}
            className={`mb-1 w-full rounded-md p-2 text-left text-sm hover:bg-muted/60 ${id === current ? 'bg-muted' : ''}`}
          >
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{id.slice(0, 2)}</span>
              <Badge
                variant={statusOf(id) === 'open' ? 'default' : 'secondary'}
              >
                {statusOf(id)}
              </Badge>
            </div>
            <div>{question}</div>
          </button>
        ))}
      </nav>
      {round ? (
        <RoundView key={round.id} round={round} />
      ) : (
        current &&
        picks[current] && (
          <pre className="flex-1 p-8 font-sans text-sm whitespace-pre-wrap">
            {picks[current]}
          </pre>
        )
      )}
    </div>
  );
}

// What the Pick bar will save: a Prototype option or an audition cell.
type Choice =
  | { from: 'prototype'; option: number }
  | { from: 'audition'; row: number; column: number };

// Where playback was, so a switch resumes at the same point of the story.
type Resume = { fraction: number; playing: boolean };

function RoundView({ round }: { round: Round & { id: string } }) {
  const [prototype, setPrototype] = useState(0);
  const [options, setOptions] = useState(() => round.prototypes.map(() => 0));
  const [choice, setChoice] = useState<Choice>({
    from: 'prototype',
    option: 0,
  });
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(statusOf(round.id) !== 'open');
  const stage = useRef<StageHandle>(null);
  const resume = useRef<Resume>({ fraction: 0, playing: false });
  const audition = useRef<AuditionHandle>(null);

  const shown = round.prototypes[prototype]!;
  const option = options[prototype]!;

  function show(nextPrototype: number, nextOption: number) {
    resume.current = stage.current?.where() ?? resume.current;
    setPrototype(nextPrototype);
    setOptions((all) =>
      all.map((value, i) => (i === nextPrototype ? nextOption : value)),
    );
    setChoice({ from: 'prototype', option: nextOption });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('textarea, input')) return;
      const number = Number(event.key);
      if (number >= 1 && number <= round.prototypes.length) {
        show(number - 1, options[number - 1]!);
      }
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (step) {
        event.preventDefault();
        const next = option + step;
        if (next >= 0 && next < shown.options.length) show(prototype, next);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const picked =
    choice.from === 'prototype'
      ? labelOf(
          shown.name,
          shown.options[choice.option]!.label,
          shown.options.length,
        )
      : `${round.audition!.rows[choice.row]!.name} · ${round.audition!.columns[choice.column]}`;
  const pickedPrototype = choice.from === 'prototype' ? shown.name : undefined;

  async function save() {
    await fetch('/__pick', {
      method: 'POST',
      body: JSON.stringify({
        round: round.id,
        question: round.question,
        pick: picked,
        rejected: round.prototypes
          .map(({ name }) => name)
          .filter((name) => name !== pickedPrototype),
        reason,
      }),
    });
    setSaved(true);
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-8">
        <header>
          <p className="text-sm text-muted-foreground">{round.subject}</p>
          <h2 className="text-2xl font-semibold">{round.question}</h2>
        </header>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {round.prototypes.map(({ name }, i) => (
                <Button
                  key={name}
                  variant={i === prototype ? 'default' : 'outline'}
                  onClick={() => show(i, options[i]!)}
                >
                  <Kbd>{i + 1}</Kbd>
                  {name}
                </Button>
              ))}
            </div>
            {shown.options.length > 1 && (
              <div className="flex items-center gap-1">
                <Kbd>←</Kbd>
                {shown.options.map(({ label }, i) => (
                  <Button
                    key={label}
                    size="sm"
                    variant={i === option ? 'secondary' : 'ghost'}
                    onClick={() => show(prototype, i)}
                  >
                    {label}
                  </Button>
                ))}
                <Kbd>→</Kbd>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{shown.idea}</p>
          <Stage
            key={`${prototype}-${option}`}
            ref={stage}
            media={shown.options[option]!}
            resume={resume.current}
            onPlay={() => audition.current?.stop()}
          />
        </section>

        {round.audition && (
          <AuditionGrid
            ref={audition}
            audition={round.audition}
            chosen={choice.from === 'audition' ? choice : undefined}
            onPlay={(row, column) => {
              stage.current?.pause();
              setChoice({ from: 'audition', row, column });
            }}
          />
        )}
      </div>

      <footer className="sticky bottom-0 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-start gap-3 p-4">
          <div className="w-48 shrink-0 pt-1">
            <div className="text-xs text-muted-foreground">Picking</div>
            <div className="font-medium">{picked}</div>
          </div>
          <Textarea
            rows={2}
            className="min-h-0"
            placeholder="Why this one? What would you still change?"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button disabled={!reason || saved} onClick={save}>
            {saved ? 'Picked' : 'Pick'}
          </Button>
        </div>
      </footer>
    </main>
  );
}

const labelOf = (name: string, option: string, count: number) =>
  count > 1 ? `${name} · ${option}` : name;

type StageHandle = { where: () => Resume; pause: () => void };

// Plays one option, picking up where the previous one left off.
function Stage({
  ref,
  media,
  resume,
  onPlay,
}: {
  ref: React.Ref<StageHandle>;
  media: Media;
  resume: Resume;
  onPlay: () => void;
}) {
  const player = useRef<PlayerRef>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const handle: StageHandle =
      'video' in media
        ? {
            where: () => ({
              fraction:
                (player.current?.getCurrentFrame() ?? 0) /
                media.video.durationInFrames,
              playing: player.current?.isPlaying() ?? false,
            }),
            pause: () => player.current?.pause(),
          }
        : {
            where: () => ({
              fraction:
                (audio.current?.currentTime ?? 0) /
                (audio.current?.duration || 1),
              playing: !(audio.current?.paused ?? true),
            }),
            pause: () => audio.current?.pause(),
          };
    if (typeof ref === 'function') ref(handle);
    else if (ref) ref.current = handle;
  });

  useEffect(() => {
    const current = player.current;
    if (!current) return;
    current.addEventListener('play', onPlay);
    return () => current.removeEventListener('play', onPlay);
  });

  if ('video' in media) {
    return (
      <Player
        ref={player}
        component={media.video.component}
        durationInFrames={media.video.durationInFrames}
        initialFrame={Math.min(
          Math.round(resume.fraction * media.video.durationInFrames),
          media.video.durationInFrames - 1,
        )}
        autoPlay={resume.playing}
        fps={24}
        compositionWidth={1920}
        compositionHeight={1080}
        className="overflow-hidden rounded-lg border"
        style={{ width: '100%' }}
        controls
        acknowledgeRemotionLicense
      />
    );
  }

  return (
    <audio
      ref={audio}
      src={media.audio}
      controls
      className="w-full"
      onPlay={onPlay}
      onLoadedMetadata={(event) => {
        const element = event.currentTarget;
        element.currentTime = resume.fraction * element.duration;
        if (resume.playing) void element.play();
      }}
    />
  );
}

type AuditionHandle = { stop: () => void };

// Every clip one click away; clicking the playing cell stops it.
function AuditionGrid({
  ref,
  audition,
  chosen,
  onPlay,
}: {
  ref: React.Ref<AuditionHandle>;
  audition: NonNullable<Round['audition']>;
  chosen?: { row: number; column: number };
  onPlay: (row: number, column: number) => void;
}) {
  const [playing, setPlaying] = useState<string>();
  const [player] = useState(() => new Audio());
  // Changing the source pauses the old clip first, so the playing cell is
  // only set once the new one actually starts.
  const loading = useRef<string>(undefined);

  useEffect(() => {
    const start = () => setPlaying(loading.current);
    const stop = () => setPlaying(undefined);
    player.addEventListener('play', start);
    player.addEventListener('ended', stop);
    player.addEventListener('pause', stop);
    return () => {
      player.pause();
      player.removeEventListener('play', start);
      player.removeEventListener('ended', stop);
      player.removeEventListener('pause', stop);
    };
  }, [player]);

  useEffect(() => {
    const handle = { stop: () => player.pause() };
    if (typeof ref === 'function') ref(handle);
    else if (ref) ref.current = handle;
  });

  function toggle(row: number, column: number) {
    const key = `${row}-${column}`;
    if (playing === key) return player.pause();
    loading.current = key;
    player.src = audition.clip(row, column);
    void player.play();
    onPlay(row, column);
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">{audition.title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-2 text-left font-normal" />
            {audition.columns.map((column) => (
              <th key={column} className="py-2 font-normal">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {audition.rows.map(({ name, note }, row) => (
            <tr key={name} className="border-t">
              <td className="py-1.5">
                <span className="font-medium">{name}</span>{' '}
                <span className="text-muted-foreground">{note}</span>
              </td>
              {audition.columns.map((column, i) => {
                const isPlaying = playing === `${row}-${i}`;
                const isChosen = chosen?.row === row && chosen.column === i;
                return (
                  <td key={column} className="py-1.5 text-center">
                    <Button
                      size="icon-sm"
                      variant={isChosen ? 'secondary' : 'ghost'}
                      aria-label={`${isPlaying ? 'Stop' : 'Play'} ${name} at ${column}`}
                      onClick={() => toggle(row, i)}
                    >
                      {isPlaying ? <Pause /> : <Play />}
                    </Button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
