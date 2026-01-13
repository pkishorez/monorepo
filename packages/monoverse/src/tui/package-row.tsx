import { colors } from "../theme.js";
import {
  getLatestVersion,
  getUpdateType,
  type SelectablePackage,
  type UpdateType,
} from "./types.js";

interface PackageRowProps {
  pkg: SelectablePackage;
  isSelected: boolean;
  nameWidth: number;
}

function VersionDisplay({
  version,
  updateType,
  width,
}: {
  version: string;
  updateType: UpdateType;
  width: number;
}) {
  const parts = version.split(".");
  const padded = version.padEnd(width);
  const padding = padded.slice(version.length);

  if (parts.length !== 3 || updateType === "none") {
    return <span fg={colors.muted}>{padded}</span>;
  }

  const [major, minor, patch] = parts;

  if (updateType === "major") {
    return (
      <>
        <span fg={colors.error}>{version}</span>
        <span>{padding}</span>
      </>
    );
  }

  if (updateType === "minor") {
    return (
      <>
        <span fg={colors.muted}>{major}.</span>
        <span fg={colors.warning}>{minor}.{patch}</span>
        <span>{padding}</span>
      </>
    );
  }

  return (
    <>
      <span fg={colors.muted}>{major}.{minor}.</span>
      <span fg={colors.cyan}>{patch}</span>
      <span>{padding}</span>
    </>
  );
}

export function PackageRow({ pkg, isSelected, nameWidth }: PackageRowProps) {
  const checkbox = pkg.selected ? "[x]" : "[ ]";
  const checkboxColor = pkg.selected ? colors.accent : colors.muted;
  const name = pkg.package.name.padEnd(nameWidth);
  const from = pkg.package.currentVersion;
  const to = getLatestVersion(pkg.package);
  const updateType = getUpdateType(pkg.package);
  const workspaceCount = pkg.package.instances.length;

  return (
    <text>
      <span fg={isSelected ? colors.accent : colors.muted}>
        {isSelected ? ">" : " "}
      </span>
      <span fg={checkboxColor}> {checkbox} </span>
      <span fg={isSelected ? colors.accent : colors.text}>{name}</span>
      <span fg={colors.muted}>{from.padEnd(12)}</span>
      <span fg={colors.muted}>→ </span>
      <VersionDisplay version={to} updateType={updateType} width={12} />
      {workspaceCount > 1 && (
        <span fg={colors.muted}> {workspaceCount}ws</span>
      )}
    </text>
  );
}
