import { type User } from "../../../../domain";

interface UserStatsProps {
  users: User[];
}

export function UserStats({ users }: UserStatsProps) {
  const activeCount = users.filter((u) => u.status === "active").length;
  const pendingCount = users.filter((u) => u.status === "pending").length;
  const inactiveCount = users.filter((u) => u.status === "inactive").length;

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 text-center">
        <div className="text-3xl font-bold">{users.length}</div>
        <div className="text-neutral-400 text-sm">Total</div>
      </div>
      <div className="bg-green-950/30 border border-green-900/50 rounded-xl p-4 text-center">
        <div className="text-3xl font-bold text-green-400">{activeCount}</div>
        <div className="text-green-400/70 text-sm">Active</div>
      </div>
      <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-xl p-4 text-center">
        <div className="text-3xl font-bold text-yellow-400">{pendingCount}</div>
        <div className="text-yellow-400/70 text-sm">Pending</div>
      </div>
      <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 text-center">
        <div className="text-3xl font-bold text-red-400">{inactiveCount}</div>
        <div className="text-red-400/70 text-sm">Inactive</div>
      </div>
    </div>
  );
}
