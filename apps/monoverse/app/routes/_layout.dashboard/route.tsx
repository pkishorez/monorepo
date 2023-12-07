import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import type { packageMapSchema, workspaceSchema } from "~/logic/domain";
import { bumpVersionRange, getWorkspaceUpgradesInfo } from "~/logic/domain";
import { getMonorepo } from "~/logic/implementation";
import { fetchPackagesMap } from "../api";

export const loader = () => {
  const pwd = process.cwd();

  const monorepo = getMonorepo(pwd);

  return json({ monorepo });
};
export default function Dashboard() {
  const { monorepo } = useLoaderData<typeof loader>();

  const [packages, setPackages] = useState<z.infer<typeof packageMapSchema>>(
    {},
  );

  useEffect(() => {
    if (!monorepo) return;

    const subscription = fetchPackagesMap(
      monorepo.workspaces.flatMap((w) => w.dependencies.map((v) => v.name)),
    ).subscribe({
      next: setPackages,
      error: console.error,
    });

    return () => {
      try {
        subscription.unsubscribe();
      } catch (err) {
        console.log("ERROR", { err });
      }
    };
  }, [monorepo]);

  if (!monorepo) return <h1>Monorepo not found :(</h1>;
  return (
    <div className="w-full">
      <h1>Dashboard</h1>
      <table className="table-auto w-full">
        <thead>
          <tr className="text-left">
            <th>Name</th>
            <th>Number of Dependencies</th>
            <th>Updates Available</th>
            <th>Unavailable</th>
          </tr>
        </thead>
        <tbody>
          {monorepo.workspaces.map((workspace) => {
            return (
              <Workspace
                workspace={workspace}
                packageMap={packages}
                key={workspace.name}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Workspace = ({
  workspace,
  packageMap,
}: {
  workspace: z.infer<typeof workspaceSchema>;
  packageMap: z.infer<typeof packageMapSchema>;
}) => {
  const upgradesInfo = getWorkspaceUpgradesInfo(workspace, packageMap);

  const upgrades = useMemo(
    () =>
      upgradesInfo.available.filter(
        (upgrade) =>
          upgrade.versionRange !==
          bumpVersionRange(upgrade.versionRange, upgrade.latestVersion),
      ),
    [upgradesInfo.available],
  );

  return (
    <tr key={workspace.name}>
      <td>{workspace.name}</td>
      <td>{workspace.dependencies.length}</td>
      <td>
        <div>{upgrades.length}</div>
      </td>
      <td>
        <div>{upgradesInfo.unavailable.length}</div>
      </td>
    </tr>
  );
};
