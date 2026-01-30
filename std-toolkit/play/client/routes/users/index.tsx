import { useLiveQuery } from "@tanstack/react-db";
import { usersCollection } from "../../collections/users";
import { CreateUserForm } from "./components/create-user-form";
import { UserActions } from "./components/user-actions";
import { UserList } from "./components/user-list";
import { UserStats } from "./components/user-stats";

export function UsersRoute() {
  const { data: users } = useLiveQuery((q) =>
    q.from({ users: usersCollection }).orderBy((q) => q.users.userId, "desc"),
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Users</h1>
        <p className="text-neutral-400">TanStack DB + SQLite Integration</p>
      </div>

      <UserStats users={users} />
      <CreateUserForm />
      <UserActions users={users} />
      <UserList users={users} />
    </div>
  );
}
