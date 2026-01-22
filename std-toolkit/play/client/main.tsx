import "./styles.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { usersCollection } from "./collections/users";
import { useLiveQuery } from "@tanstack/react-db";
import type { User } from "../domain";

function App() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Live query - automatically updates when collection changes
  const { data: users } = useLiveQuery((q) =>
    q.from({ users: usersCollection }),
  );

  console.log("USERS: ", users);

  const handleCreate = async () => {
    if (!name || !email) return;

    usersCollection.insert({
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      evolution: "v2 test!",
      name,
      email,
      status: "pending",
    });

    setName("");
    setEmail("");
  };

  const handleUpdate = async (id: string, updates: Partial<User>) => {
    usersCollection.update(id, (draft) => {
      if (updates.name !== undefined) draft.name = updates.name;
      if (updates.email !== undefined) draft.email = updates.email;
      if (updates.status !== undefined) draft.status = updates.status;
    });
    setEditingId(null);
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Users (TanStack DB)</h1>

        {/* Create Form */}
        <div className="bg-neutral-800 p-4 rounded-lg mb-6">
          <h2 className="text-lg mb-3">Create User</h2>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="bg-neutral-700 px-3 py-2 rounded flex-1"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="bg-neutral-700 px-3 py-2 rounded flex-1"
            />
            <button
              onClick={handleCreate}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded cursor-pointer"
            >
              Create
            </button>
          </div>
        </div>

        {/* User List */}
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-neutral-800 p-3 rounded-lg flex items-center gap-3"
            >
              {editingId === user.id ? (
                <EditForm
                  user={user}
                  onSave={handleUpdate}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <span className="flex-1">{user.name}</span>
                  <span className="text-neutral-400 text-sm">{user.email}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      user.status === "active"
                        ? "bg-green-600"
                        : user.status === "pending"
                          ? "bg-yellow-600"
                          : "bg-red-600"
                    }`}
                  >
                    {user.status}
                  </span>
                  <button
                    onClick={() => setEditingId(user.id)}
                    className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm cursor-pointer"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-neutral-500 text-center py-4">No users yet</p>
          )}
        </div>
      </div>
    </main>
  );
}

// Edit form component
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
    <div className="flex gap-2 flex-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="bg-neutral-700 px-2 py-1 rounded flex-1"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-neutral-700 px-2 py-1 rounded flex-1"
      />
      <button
        onClick={() => onSave(user.id, { name, email })}
        className="bg-green-600 px-3 py-1 rounded text-sm cursor-pointer"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="bg-neutral-600 px-3 py-1 rounded text-sm cursor-pointer"
      >
        Cancel
      </button>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
