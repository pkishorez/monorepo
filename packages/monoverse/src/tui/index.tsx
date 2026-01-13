import { createCliRenderer } from "@opentui/core";
import type { ScrollBoxRenderable } from "@opentui/core";
import {
  createRoot,
  useKeyboard,
  useTerminalDimensions,
} from "@opentui/react";
import { Effect } from "effect";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Monoverse,
  type LoadProgress,
  type PackageUpdate,
} from "../core/index.js";
import { colors } from "../theme.js";
import { PackageRow } from "./package-row.js";
import {
  createSelectablePackage,
  getLatestVersion,
  getUpdateType,
  type SelectablePackage,
} from "./types.js";

export const renderTui = async (cwd: string = process.cwd()) => {
  function App() {
    const { width, height } = useTerminalDimensions();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [packages, setPackages] = useState<SelectablePackage[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [progress, setProgress] = useState<LoadProgress>({
      total: 0,
      loaded: 0,
      currentPackage: "",
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const scrollRef = useRef<ScrollBoxRenderable>(null);

    const selectedCount = packages.filter((p) => p.selected).length;
    const maxNameWidth = useMemo(
      () => Math.max(10, ...packages.map((p) => p.package.name.length)) + 1,
      [packages]
    );

    const summary = useMemo(() => {
      const selected = packages.filter((p) => p.selected);
      let major = 0;
      let minor = 0;
      let patch = 0;
      for (const p of selected) {
        const type = getUpdateType(p.package);
        if (type === "major") major++;
        else if (type === "minor") minor++;
        else if (type === "patch") patch++;
      }
      return { major, minor, patch, total: packages.length };
    }, [packages]);

    useEffect(() => {
      if (scrollRef.current && packages.length > 0) {
        scrollRef.current.scrollTo(Math.min(selectedIndex, packages.length - 1));
      }
    }, [selectedIndex, packages.length]);

    const loadPackages = () => {
      setPackages([]);
      setSelectedIndex(0);
      setIsLoading(true);
      setMessage(null);
      setProgress({ total: 0, loaded: 0, currentPackage: "" });

      const program = Effect.gen(function* () {
        const monoverse = yield* Monoverse;
        const analysis = yield* monoverse.analyze(cwd);
        const violations = yield* monoverse.validate(analysis);

        yield* monoverse.getUpdatesWithProgress(
          analysis,
          violations,
          (p: LoadProgress) => setProgress(p),
          (update: PackageUpdate) => {
            const selectable = createSelectablePackage(update);
            if (selectable) {
              setPackages((prev) => [...prev, selectable]);
            }
          }
        );

        setIsLoading(false);
      }).pipe(Effect.provide(Monoverse.Default));

      Effect.runPromise(program).catch((err) => {
        setMessage(`Error: ${String(err)}`);
        setIsLoading(false);
      });
    };

    useEffect(() => {
      loadPackages();
    }, []);

    const handleToggle = () => {
      if (packages.length === 0) return;
      setPackages((prev) =>
        prev.map((p, i) =>
          i === selectedIndex ? { ...p, selected: !p.selected } : p
        )
      );
    };

    const handleSelectAll = () => {
      setPackages((prev) => prev.map((p) => ({ ...p, selected: true })));
    };

    const handleSelectNone = () => {
      setPackages((prev) => prev.map((p) => ({ ...p, selected: false })));
    };

    const handleSync = () => {
      const toSync = packages.filter((p) => p.selected);
      if (toSync.length === 0) {
        setMessage("Nothing selected");
        return;
      }

      setIsSyncing(true);

      const program = Effect.gen(function* () {
        const monoverse = yield* Monoverse;
        const analysis = yield* monoverse.analyze(cwd);

        for (const item of toSync) {
          const targetVersion = getLatestVersion(item.package);
          for (const instance of item.package.instances) {
            if (instance.type === "peerDependency") continue;

            const workspace = analysis.workspaces.find(
              (w) => w.name === instance.workspace
            );
            if (!workspace) continue;

            yield* monoverse.upsertDependency({
              packageName: item.package.name,
              versionRange: targetVersion,
              dependencyType: instance.type,
              workspace,
            });
          }
        }
      }).pipe(Effect.provide(Monoverse.Default));

      Effect.runPromise(program)
        .then(() => {
          setPackages((prev) => prev.filter((p) => !p.selected));
          setMessage(`Synced ${toSync.length} packages`);
          setSelectedIndex(0);
        })
        .catch((err) => {
          setMessage(`Failed: ${String(err)}`);
        })
        .finally(() => {
          setIsSyncing(false);
        });
    };

    useKeyboard((key) => {
      if (key.name === "q") {
        renderer.destroy();
        process.exit(0);
      }

      if (isSyncing) return;

      if (key.name === "up" || key.name === "k") {
        setSelectedIndex((prev: number) => Math.max(0, prev - 1));
        setMessage(null);
      }

      if (key.name === "down" || key.name === "j") {
        setSelectedIndex((prev: number) =>
          Math.min(packages.length - 1, prev + 1)
        );
        setMessage(null);
      }

      if (key.name === "space") {
        handleToggle();
      }

      if (key.name === "a") {
        handleSelectAll();
      }

      if (key.name === "n") {
        handleSelectNone();
      }

      if (key.name === "s") {
        handleSync();
      }

      if (key.name === "r") {
        loadPackages();
      }
    });

    const progressPercent =
      progress.total > 0
        ? Math.round((progress.loaded / progress.total) * 100)
        : 0;
    const barWidth = Math.max(10, width - 30);
    const filledWidth = Math.round(
      (progress.loaded / Math.max(1, progress.total)) * barWidth
    );

    return (
      <box
        width={width}
        height={height}
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor={colors.muted}
        title=" monoverse "
        titleAlignment="center"
      >
        {packages.length > 0 && (
          <box paddingLeft={1} paddingRight={1} paddingTop={1}>
            <text>
              <span fg={colors.muted}>Scheduled: </span>
              {summary.major > 0 && (
                <>
                  <span fg={colors.error}>{summary.major} major</span>
                  <span fg={colors.muted}>{summary.minor > 0 || summary.patch > 0 ? ", " : " "}</span>
                </>
              )}
              {summary.minor > 0 && (
                <>
                  <span fg={colors.warning}>{summary.minor} minor</span>
                  <span fg={colors.muted}>{summary.patch > 0 ? ", " : " "}</span>
                </>
              )}
              {summary.patch > 0 && (
                <span fg={colors.cyan}>{summary.patch} patch</span>
              )}
              {selectedCount === 0 && <span fg={colors.muted}>none</span>}
              <span fg={colors.muted}> ({selectedCount}/{summary.total})</span>
            </text>
          </box>
        )}
        <scrollbox ref={scrollRef} flexGrow={1} scrollY padding={1}>
          {packages.length === 0 && !isLoading ? (
            <box flexGrow={1} justifyContent="center" alignItems="center">
              <text>
                <span fg={colors.cyan}>All packages up to date!</span>
              </text>
            </box>
          ) : (
            packages.map((pkg, index) => (
              <PackageRow
                key={pkg.package.name}
                pkg={pkg}
                isSelected={index === selectedIndex}
                nameWidth={maxNameWidth}
              />
            ))
          )}
        </scrollbox>
        {isLoading && (
          <box paddingLeft={1} paddingRight={1} paddingBottom={1}>
            <text>
              <span fg={colors.cyan}>{"█".repeat(filledWidth)}</span>
              <span fg={colors.muted}>{"░".repeat(barWidth - filledWidth)}</span>
              <span fg={colors.text}> {progressPercent}%</span>
              <span fg={colors.muted}>
                {" "}
                {progress.loaded}/{progress.total}
              </span>
            </text>
          </box>
        )}
        {isSyncing && (
          <box paddingLeft={1} paddingRight={1} paddingBottom={1}>
            <text>
              <span fg={colors.warning}>Syncing...</span>
            </text>
          </box>
        )}
        <box paddingLeft={1} paddingRight={1} paddingBottom={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text>
              <span fg={colors.muted}>[space]</span>
              <span fg={colors.primary}> toggle </span>
              <span fg={colors.muted}>[a]</span>
              <span fg={colors.primary}>ll </span>
              <span fg={colors.muted}>[n]</span>
              <span fg={colors.primary}>one </span>
              <span fg={colors.muted}>[s]</span>
              <span fg={colors.primary}>ync </span>
              <span fg={colors.muted}>[r]</span>
              <span fg={colors.primary}>eload </span>
              <span fg={colors.muted}>[q]</span>
              <span fg={colors.primary}>uit</span>
            </text>
            {message && (
              <text>
                <span fg={colors.cyan}>{message}</span>
              </text>
            )}
          </box>
        </box>
      </box>
    );
  }

  const renderer = await createCliRenderer({
    exitSignals: ["SIGTERM", "SIGINT", "SIGHUP"],
  });

  return createRoot(renderer).render(<App />);
};
