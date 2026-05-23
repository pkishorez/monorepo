import { createFileRoute } from '@tanstack/react-router';
import { useMachine } from '@xstate/react';
import { useMemo } from 'react';
import { terminalMachine } from './components/terminal-machine';
import { Terminal } from './components/terminal';
import { SessionList } from './components/session-list';

function HomePage() {
  const [state, send] = useMachine(terminalMachine);

  const activeSession = useMemo(() => {
    if (state.context.activeSessionId === null) return null;
    return (
      state.context.sessions.find(
        (s) => s.id === state.context.activeSessionId,
      ) ?? null
    );
  }, [state.context.sessions, state.context.activeSessionId]);

  if (state.matches('active') && state.context.activeSessionId !== null) {
    return (
      <Terminal
        sessionId={state.context.activeSessionId}
        readOnly={state.context.readOnly}
        config={
          activeSession
            ? { cols: activeSession.cols, rows: activeSession.rows }
            : undefined
        }
        onBack={() => send({ type: 'DISCONNECT' })}
      />
    );
  }

  return (
    <SessionList
      sessions={state.context.sessions}
      loading={state.matches('loading')}
      creating={state.matches('creating')}
      error={state.context.error}
      onSelect={(id, readOnly) => send({ type: 'SELECT', id, readOnly })}
      onCreate={() => send({ type: 'CREATE' })}
      onRefresh={() => send({ type: 'REFRESH' })}
    />
  );
}

export const Route = createFileRoute('/')({
  component: HomePage,
});
