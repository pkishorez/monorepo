import { useState } from "react";
import { usersCollection } from "../../../collections/users";
import { generateUserId } from "../utils/generate-user";

export function CreateUserForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleCreate = () => {
    if (!name || !email) return;

    usersCollection.insert({
      id: generateUserId(),
      evolution: "v2 test!",
      name,
      email,
      status: "pending",
    });

    setName("");
    setEmail("");
  };

  return (
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
  );
}
