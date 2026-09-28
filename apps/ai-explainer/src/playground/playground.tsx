import { useEffect, useState } from 'react';
import { Player } from '@remotion/player';
import { Badge } from '@kstackz/ui-toolkit/components/ui/badge';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Textarea } from '@kstackz/ui-toolkit/components/ui/textarea';
import type { defineRound } from './round.ts';

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
      <nav className="w-72 shrink-0 border-r p-4">
        <h1 className="mb-4 font-semibold">Rounds</h1>
        {rounds.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No Rounds yet. Start one with /foundation or /explainer.
          </p>
        )}
        {rounds.map(({ id, question }) => (
          <button
            key={id}
            onClick={() => select(id)}
            className={`mb-1 w-full rounded-md p-2 text-left text-sm ${id === current ? 'bg-muted' : ''}`}
          >
            <Badge variant="secondary" className="mb-1">
              {statusOf(id)}
            </Badge>
            <div>{question}</div>
          </button>
        ))}
      </nav>
      {round ? (
        <RoundView key={round.id} round={round} />
      ) : (
        current &&
        picks[current] && (
          <pre className="flex-1 p-6 font-sans text-sm whitespace-pre-wrap">
            {picks[current]}
          </pre>
        )
      )}
    </div>
  );
}

function RoundView({ round }: { round: Round & { id: string } }) {
  const [pick, setPick] = useState<string>();
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(statusOf(round.id) !== 'open');

  async function save() {
    await fetch('/__pick', {
      method: 'POST',
      body: JSON.stringify({
        round: round.id,
        question: round.question,
        pick,
        rejected: round.prototypes
          .map(({ name }) => name)
          .filter((name) => name !== pick),
        reason,
      }),
    });
    setSaved(true);
  }

  return (
    <main className="flex-1 p-6">
      <p className="text-sm text-muted-foreground">{round.subject}</p>
      <h2 className="mb-6 text-2xl font-semibold">{round.question}</h2>
      <div className="grid grid-cols-2 gap-6">
        {round.prototypes.map(({ name, idea, video }) => (
          <label
            key={name}
            className={`cursor-pointer rounded-lg border p-3 ${pick === name ? 'ring-2 ring-ring' : ''}`}
          >
            <Player
              component={video.component}
              durationInFrames={video.durationInFrames}
              fps={24}
              compositionWidth={1920}
              compositionHeight={1080}
              style={{ width: '100%' }}
              controls
              loop
              acknowledgeRemotionLicense
            />
            <div className="mt-3 flex items-start gap-2">
              <input
                type="radio"
                name="pick"
                className="mt-1"
                checked={pick === name}
                onChange={() => setPick(name)}
              />
              <div>
                <div className="font-medium">{name}</div>
                <p className="text-sm text-muted-foreground">{idea}</p>
              </div>
            </div>
          </label>
        ))}
      </div>
      <div className="mt-6 max-w-2xl space-y-3">
        <Textarea
          placeholder="Why this one? What would you still change?"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Button disabled={!pick || !reason || saved} onClick={save}>
          {saved ? 'Picked' : 'Pick'}
        </Button>
      </div>
    </main>
  );
}
