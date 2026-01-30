import { useState } from "react";
import { type User } from "../../../../domain";
import { usersCollection } from "../../../collections/users";
import { UserItem } from "./user-item";

interface UserListProps {
  users: User[];
}

export function UserList({ users }: UserListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleUpdate = (id: string, updates: Partial<User>) => {
    usersCollection.update(id, (draft) => {
      if (updates.name !== undefined) draft.name = updates.name;
      if (updates.email !== undefined) draft.email = updates.email;
      if (updates.status !== undefined) draft.status = updates.status;
    });
    setEditingId(null);
  };

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <p className="mb-2">No users yet</p>
        <p className="text-sm">Create one above or add random users</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {users.map((user) => (
        <UserItem
          key={user.id}
          user={user}
          isEditing={editingId === user.id}
          onEdit={() => setEditingId(user.id)}
          onSave={handleUpdate}
          onCancelEdit={() => setEditingId(null)}
        />
      ))}
    </div>
  );
}
