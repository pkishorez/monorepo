import "./styles.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { usersCollection } from "./collections/users";
import { useLiveQuery } from "@tanstack/react-db";
import { UserSchema, type User } from "../domain";

const firstNames = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Eve",
  "Frank",
  "Grace",
  "Henry",
  "Ivy",
  "Jack",
  "Kate",
  "Leo",
  "Mia",
  "Noah",
  "Olivia",
  "Paul",
  "Quinn",
  "Ruby",
  "Sam",
  "Tara",
  "Uma",
  "Victor",
  "Wendy",
  "Xander",
  "Yara",
  "Zach",
];

const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Anderson",
  "Taylor",
  "Thomas",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Thompson",
  "White",
  "Harris",
  "Clark",
  "Lewis",
];

const domains = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "proton.me",
  "icloud.com",
];
const statuses: User["status"][] = ["active", "pending", "inactive"];

function generateRandomUser(): User {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const status = statuses[Math.floor(Math.random() * statuses.length)];

  return {
    id: UserSchema.makeId(`user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
    evolution: "v2 test!",
    name: `${firstName} ${lastName}`,
    email: `${firstName?.toLowerCase()}.${lastName?.toLowerCase()}@${domain}`,
    status: status ?? "active",
  };
}

function App() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: users } = useLiveQuery((q) =>
    q.from({ users: usersCollection }).orderBy((q) => q.users.id, "desc"),
  );

  const handleCreate = async () => {
    if (!name || !email) return;

    usersCollection.insert({
      id: UserSchema.makeId(`user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`),
      evolution: "v2 test!",
      name,
      email,
      status: "pending",
    });

    setName("");
    setEmail("");
  };

  const handleAddRandom = () => {
    for (let i = 0; i < 20; i++) {
      usersCollection.insert(generateRandomUser());
    }
  };

  const handleDeleteAll = () => {
    users.forEach((user) => usersCollection.delete(user.id));
  };

  const handleUpdate = async (id: string, updates: Partial<User>) => {
    usersCollection.update(id, (draft) => {
      if (updates.name !== undefined) draft.name = updates.name;
      if (updates.email !== undefined) draft.email = updates.email;
      if (updates.status !== undefined) draft.status = updates.status;
    });
    setEditingId(null);
  };

  const activeCount = users.filter((u) => u.status === "active").length;
  const pendingCount = users.filter((u) => u.status === "pending").length;
  const inactiveCount = users.filter((u) => u.status === "inactive").length;

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Users</h1>
          <p className="text-neutral-400">TanStack DB + SQLite Integration</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold">{users.length}</div>
            <div className="text-neutral-400 text-sm">Total</div>
          </div>
          <div className="bg-green-950/30 border border-green-900/50 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-400">
              {activeCount}
            </div>
            <div className="text-green-400/70 text-sm">Active</div>
          </div>
          <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-yellow-400">
              {pendingCount}
            </div>
            <div className="text-yellow-400/70 text-sm">Pending</div>
          </div>
          <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-red-400">
              {inactiveCount}
            </div>
            <div className="text-red-400/70 text-sm">Inactive</div>
          </div>
        </div>

        {/* Create Form */}
        <div className="bg-neutral-800/50 border border-neutral-700 p-5 rounded-xl mb-6">
          <h2 className="text-lg font-medium mb-4">Create User</h2>
          <div className="flex gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="bg-neutral-900 border border-neutral-700 px-4 py-2.5 rounded-lg flex-1 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="bg-neutral-900 border border-neutral-700 px-4 py-2.5 rounded-lg flex-1 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              onClick={handleCreate}
              className="bg-green-600 hover:bg-green-500 px-5 py-2.5 rounded-lg font-medium cursor-pointer transition-colors"
            >
              Create
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleAddRandom}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
          >
            + Add 20 Random
          </button>
          {users.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            >
              Delete All
            </button>
          )}
        </div>

        {/* User List */}
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-neutral-800/50 border border-neutral-700 p-4 rounded-xl flex items-center gap-4 hover:border-neutral-600 transition-colors"
            >
              {editingId === user.id ? (
                <EditForm
                  user={user}
                  onSave={handleUpdate}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center font-medium text-sm">
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-neutral-400 text-sm truncate">
                      {user.email}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                      user.status === "active"
                        ? "bg-green-500/20 text-green-400"
                        : user.status === "pending"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {user.status}
                  </span>
                  <button
                    onClick={() => setEditingId(user.id)}
                    className="bg-neutral-700 hover:bg-neutral-600 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          ))}
          {users.length === 0 && (
            <div className="text-center py-12 text-neutral-500">
              <p className="mb-2">No users yet</p>
              <p className="text-sm">Create one above or add random users</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function EditForm({
  user,
  onSave,
  onCancel,
}: {
  user: User;
  onSave: (id: string, updates: Partial<User>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);

  return (
    <div className="flex gap-3 flex-1 items-center">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="bg-neutral-900 border border-neutral-600 px-3 py-2 rounded-lg flex-1 focus:outline-none focus:border-blue-500 transition-colors"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-neutral-900 border border-neutral-600 px-3 py-2 rounded-lg flex-1 focus:outline-none focus:border-blue-500 transition-colors"
      />
      <button
        onClick={() => onSave(user.id, { name, email })}
        className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="bg-neutral-700 hover:bg-neutral-600 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
