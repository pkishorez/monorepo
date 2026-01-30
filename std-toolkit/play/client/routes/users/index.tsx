import { useLiveQuery } from "@tanstack/react-db";
import { usersCollection } from "../../collections/users";
import { UserTable } from "./components/user-table";
import { HeaderStats } from "./components/header-stats";
import { QuickActions } from "./components/quick-actions";

export function UsersRoute() {
  const { data: users } = useLiveQuery((q) =>
    q.from({ users: usersCollection }).orderBy((q) => q.users.createdAt, "desc"),
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold">Users</h1>
          <QuickActions users={users} />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-neutral-500 text-sm">TanStack DB + SQLite</p>
          <HeaderStats users={users} />
        </div>
      </div>

      <UserTable users={users} />
    </div>
  );
}
