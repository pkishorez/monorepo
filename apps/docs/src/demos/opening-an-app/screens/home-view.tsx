import { use } from 'react';
import { motion } from 'motion/react';
import { LogOut, RefreshCw } from 'lucide-react';
import { View } from '@kstackz/kabuki/react';
import { Home } from '../story/index.ts';
import { Button, Clock, PastContext, Wide } from './parts.tsx';

/** The signed-in page: a greeting, the connection, and the sync the user turns on and off. */
export const HomeView = View.make(Home, ({ model, props, send }) => (
  <section className="flex flex-col gap-6">
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-xl font-medium tracking-tight @md:text-2xl">
          Welcome back, {props.name}
        </h1>
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="relative flex size-2">
            <motion.span
              key={model.beats}
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full bg-emerald-500"
            />
            <span className="relative size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="tabular-nums">
            Connected
            {model.beats > 0 &&
              ` · ${model.beats} heartbeat${model.beats === 1 ? '' : 's'}`}
          </span>
        </p>
      </div>
      <Button
        busy={model.signingOut}
        busyLabel={<Wide>Signing out…</Wide>}
        label="Sign out"
        onClick={() => send({ _tag: 'SignOut' })}
      >
        <LogOut className="size-3.5" />
        <Wide>Sign out</Wide>
      </Button>
    </div>

    {/* One row, always the same height: each sync is a ripple off the icon. */}
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="relative grid size-9 shrink-0 place-items-center">
        {model.synced > 0 && (
          <motion.span
            key={model.synced}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="absolute inset-0 rounded-xl border border-emerald-500 motion-reduce:hidden"
          />
        )}
        <span
          className={`relative grid size-9 place-items-center rounded-xl transition-colors duration-200 ${
            model.sync
              ? 'bg-emerald-500/10 text-emerald-500'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <RefreshCw
            className={`size-4 ${model.sync ? 'animate-spin [animation-duration:2s] motion-reduce:animate-none' : ''}`}
          />
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">Sync</span>
        <span className="truncate text-[13px] text-muted-foreground">
          {model.last === null ? (
            model.sync ? (
              'Starting the first sync…'
            ) : (
              'Keep your files up to date'
            )
          ) : (
            <>
              {model.sync ? '' : 'Off · '}
              <span className="tabular-nums">{model.synced} synced</span>
              {' · last at '}
              <Clock at={model.last} />
            </>
          )}
        </span>
      </div>
      <Switch on={model.sync} onClick={() => send({ _tag: 'ToggleSync' })} />
    </div>
  </section>
));

function Switch({
  on,
  onClick,
}: {
  readonly on: boolean;
  readonly onClick: () => void;
}) {
  const past = use(PastContext);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Sync"
      disabled={past}
      onClick={onClick}
      className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 ${
        on ? 'bg-emerald-500' : 'bg-foreground/15'
      }`}
    >
      <motion.span
        initial={false}
        animate={{ x: on ? 16 : 0 }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
        className="size-5 rounded-full bg-white shadow-sm"
      />
    </button>
  );
}
