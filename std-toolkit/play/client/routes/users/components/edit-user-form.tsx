import { useState } from "react";
import { type User } from "../../../../domain";

interface EditUserFormProps {
  user: User;
  onSave: (id: string, updates: Partial<User>) => void;
  onCancel: () => void;
}

export function EditUserForm({ user, onSave, onCancel }: EditUserFormProps) {
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
