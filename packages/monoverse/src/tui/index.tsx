import { createCliRenderer } from '@opentui/core';
import { createRoot, useKeyboard, useTerminalDimensions } from '@opentui/react';
import { Effect } from 'effect';
import { useState } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import { Monoverse } from '../core/index.js';
import type {
  MonorepoAnalysis,
  Workspace,
} from '../core/pipeline/analyze/index.js';

const renderer = await createCliRenderer({
  exitSignals: ['SIGTERM', 'SIGINT', 'SIGHUP'],
});

interface DependencyStats {
  dependency: number;
  devDependency: number;
  peerDependency: number;
  optionalDependency: number;
  workspace: number;
}

const getDepStats = (ws: Workspace): DependencyStats => {
  const stats: DependencyStats = {
    dependency: 0,
    devDependency: 0,
    peerDependency: 0,
    optionalDependency: 0,
    workspace: 0,
  };

  for (const dep of ws.dependencies) {
    stats[dep.dependencyType]++;
    if (dep.source === 'workspace') stats.workspace++;
  }

  return stats;
};

function WorkspaceRow({ ws, index }: { ws: Workspace; index: number }) {
  const stats = getDepStats(ws);
  const badge = ws.private ? '*' : ' ';

  // Format: "01  3/5/2 +1ws  workspace-name *"
  const depsStr = `${stats.dependency}/${stats.devDependency}/${stats.peerDependency}`;
  const wsStr = stats.workspace > 0 ? `+${stats.workspace}ws` : '    ';

  return (
    <text>
      <span fg="#555">{String(index + 1).padStart(2)} </span>
      <span fg="#7a7">{depsStr.padEnd(7)}</span>
      <span fg="#7aa">{wsStr} </span>
      <span fg="#ccc">{ws.name}</span>
      <span fg="#666"> {badge}</span>
    </text>
  );
}

function FullScreenBox({ children }: { children: React.ReactNode }) {
  const { width, height } = useTerminalDimensions();
  return (
    <box width={width} height={height} flexDirection="column" gap={1}>
      <text bg="#000" width={width} height={height}>
        <span bg="#000">{' '.repeat(width * height)}</span>
      </text>
      <box
        position="absolute"
        top={0}
        left={0}
        width={width}
        height={height}
        flexDirection="column"
        padding={1}
        gap={1}
      >
        {children}
      </box>
    </box>
  );
}

function App() {
  const [data, setData] = useState<MonorepoAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useKeyboard((key) => {
    if (key.name === 'q' || key.name === 'escape') {
      renderer.destroy();
      process.exit(0);
    }
  });

  useComponentLifecycle(
    Effect.gen(function* () {
      const monoverse = yield* Monoverse;
      const result = yield* monoverse.analyze(process.cwd()).pipe(Effect.either);

      if (result._tag === 'Left') {
        setError(result.left.message);
      } else {
        setData(result.right);
      }
      setLoading(false);
    }).pipe(Effect.provide(Monoverse.Default)),
  );

  if (loading) {
    return (
      <FullScreenBox>
        <text>
          <span fg="#777" bg="#000">
            Analyzing...
          </span>
        </text>
      </FullScreenBox>
    );
  }

  if (error) {
    return (
      <FullScreenBox>
        <text>
          <span fg="#e66" bg="#000">
            {error}
          </span>
        </text>
      </FullScreenBox>
    );
  }

  if (!data) return null;

  const totalDeps = data.workspaces.reduce(
    (acc, ws) => acc + ws.dependencies.length,
    0,
  );
  const totalWsDeps = data.workspaces.reduce(
    (acc, ws) =>
      acc + ws.dependencies.filter((d) => d.source === 'workspace').length,
    0,
  );
  const privateCount = data.workspaces.filter((ws) => ws.private).length;

  return (
    <FullScreenBox>
      <box flexDirection="column">
        <text>
          <span fg="#fff" bg="#000">
            monoverse
          </span>
          <span fg="#555" bg="#000">
            {' '}
            |{' '}
          </span>
          <span fg="#888" bg="#000">
            {data.packageManager}
          </span>
        </text>
        <text>
          <span fg="#444" bg="#000">
            {data.root}
          </span>
        </text>
      </box>

      <text>
        <span fg="#888" bg="#000">
          {data.workspaces.length} workspaces
        </span>
        {privateCount > 0 && (
          <span fg="#555" bg="#000">
            {' '}
            ({privateCount} private)
          </span>
        )}
        <span fg="#444" bg="#000">
          {' '}
          |{' '}
        </span>
        <span fg="#888" bg="#000">
          {totalDeps} deps
        </span>
        {totalWsDeps > 0 && (
          <span fg="#555" bg="#000">
            {' '}
            ({totalWsDeps} workspace)
          </span>
        )}
      </text>

      <box flexDirection="column">
        <text>
          <span fg="#555" bg="#000">
            {' '}
            d/D/p name
          </span>
        </text>
        {data.workspaces.map((ws, i) => (
          <WorkspaceRow key={ws.path} ws={ws} index={i} />
        ))}
      </box>

      {data.errors.length > 0 && (
        <box flexDirection="column">
          {data.errors.map((err) => (
            <text key={err.path}>
              <span fg="#e66" bg="#000">
                {err.message}
              </span>
            </text>
          ))}
        </box>
      )}

      <text>
        <span fg="#333" bg="#000">
          q to exit
        </span>
      </text>
    </FullScreenBox>
  );
}

createRoot(renderer).render(<App />);
