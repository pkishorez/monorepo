import { Option } from 'effect';
import type { TerminalInfo } from '@/domain/terminal';

interface SessionListProps {
  sessions: TerminalInfo[];
  loading: boolean;
  creating: boolean;
  error: string | null;
  onSelect: (id: number, readOnly: boolean) => void;
  onCreate: () => void;
  onRefresh: () => void;
}

export function SessionList({
  sessions,
  loading,
  creating,
  error,
  onSelect,
  onCreate,
  onRefresh,
}: SessionListProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#09090b] p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-medium text-zinc-200">Sessions</h1>
          <button
            onClick={onCreate}
            disabled={creating}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Creating...' : 'New Session'}
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-md bg-red-950/50 px-3 py-2 text-sm text-red-400">
            <span>{error}</span>
            <button
              onClick={onRefresh}
              className="ml-3 text-red-300 underline hover:text-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-600">
            No sessions. Create one to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => {
              const isExited = session.status === 'exited';
              const exitCode = Option.getOrUndefined(session.exitCode);
              return (
                <button
                  key={session.id}
                  onClick={() => onSelect(session.id, isExited)}
                  className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors ${
                    isExited
                      ? 'border-zinc-800/50 text-zinc-600 hover:bg-zinc-900/50'
                      : 'border-zinc-800 text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                      isExited ? 'bg-zinc-600' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="font-mono text-sm">#{session.id}</span>
                  <span className="flex-1 truncate text-sm text-zinc-500">
                    {session.cwd}
                  </span>
                  {isExited && exitCode !== undefined && (
                    <span
                      className={`text-xs ${exitCode === 0 ? 'text-zinc-600' : 'text-red-400'}`}
                    >
                      exit {exitCode}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
