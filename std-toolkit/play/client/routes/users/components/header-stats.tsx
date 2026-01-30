import { type User } from "../../../../domain";

interface HeaderStatsProps {
  users: User[];
}

export function HeaderStats({ users }: HeaderStatsProps) {
  const active = users.filter((u) => u.status === "active").length;
  const inactive = users.filter((u) => u.status === "inactive").length;
  const suspended = users.filter((u) => u.status === "suspended").length;

  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="text-neutral-400">
        <span className="text-white font-medium">{users.length}</span> total
      </span>
      <span className="text-neutral-600">|</span>
      <span className="text-green-400/80">
        <span className="font-medium">{active}</span> active
      </span>
      <span className="text-amber-400/80">
        <span className="font-medium">{inactive}</span> inactive
      </span>
      <span className="text-red-400/80">
        <span className="font-medium">{suspended}</span> suspended
      </span>
    </div>
  );
}
