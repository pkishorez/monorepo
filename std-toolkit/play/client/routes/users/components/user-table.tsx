import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type User } from "../../../../domain";
import { usersCollection } from "../../../collections/users";
import { useUsersStore } from "../store";
import { generateUserId } from "../utils/generate-user";

interface UserTableProps {
  users: User[];
}

const statusOptions: User["status"][] = ["active", "inactive", "suspended"];

const statusColors: Record<User["status"], string> = {
  active: "text-green-400",
  inactive: "text-amber-400",
  suspended: "text-red-400",
};

const scrollbarStyles =
  "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-neutral-800 [&::-webkit-scrollbar-thumb]:bg-neutral-600 [&::-webkit-scrollbar-thumb]:rounded";

interface EditableCellProps {
  userId: string;
  field: "name" | "email";
  value: string;
  className?: string;
  onUpdate: (userId: string, field: keyof User, value: string) => void;
}

function EditableCell({ userId, field, value, className = "", onUpdate }: EditableCellProps) {
  const { editingCell, setEditingCell } = useUsersStore();
  const isEditing = editingCell?.userId === userId && editingCell?.field === field;
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setTempValue(value);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing, value]);

  const handleSave = () => {
    if (tempValue.trim() && tempValue !== value) {
      onUpdate(userId, field, tempValue.trim());
    } else {
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="bg-neutral-900 border border-blue-500 px-2 py-0.5 rounded text-sm w-full focus:outline-none"
      />
    );
  }

  return (
    <span
      onClick={() => setEditingCell({ userId, field })}
      className={`cursor-pointer hover:text-blue-400 transition-colors ${className}`}
    >
      {value}
    </span>
  );
}

export function UserTable({ users }: UserTableProps) {
  const { recentlyUpdated, setEditingCell, markUpdated } = useUsersStore();
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const handleCreate = () => {
    if (!newName.trim() || !newEmail.trim()) return;
    const userId = generateUserId();
    usersCollection.insert({
      userId,
      name: newName.trim(),
      email: newEmail.trim(),
      status: "active",
      createdAt: Date.now(),
    });
    setNewName("");
    setNewEmail("");
    markUpdated(userId);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") {
      e.preventDefault();
      action();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const handleUpdate = (userId: string, field: keyof User, value: string) => {
    usersCollection.update(userId, (draft) => {
      if (field === "name") draft.name = value;
      if (field === "email") draft.email = value;
      if (field === "status") draft.status = value as User["status"];
    });
    setEditingCell(null);
    markUpdated(userId);
  };

  const handleDelete = (userId: string) => {
    usersCollection.delete(userId);
  };

  const cycleStatus = (user: User) => {
    const currentIndex = statusOptions.indexOf(user.status);
    const nextIndex = (currentIndex + 1) % statusOptions.length;
    const nextStatus = statusOptions[nextIndex];
    if (nextStatus) {
      handleUpdate(user.userId, "status", nextStatus);
    }
  };

  return (
    <div className={`border border-neutral-700 rounded-lg overflow-hidden ${scrollbarStyles}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-800 border-b border-neutral-700">
            <th className="text-left px-4 py-2.5 text-neutral-400 font-medium w-[200px]">Name</th>
            <th className="text-left px-4 py-2.5 text-neutral-400 font-medium">Email</th>
            <th className="text-left px-4 py-2.5 text-neutral-400 font-medium w-[100px]">Status</th>
            <th className="text-right px-4 py-2.5 text-neutral-400 font-medium w-[60px]"></th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-700 bg-neutral-800/30">
            <td className="px-4 py-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleCreate)}
                placeholder="Name"
                className="bg-neutral-900 border border-neutral-700 px-2 py-1 rounded text-sm w-full focus:outline-none focus:border-blue-500 transition-colors placeholder:text-neutral-600"
              />
            </td>
            <td className="px-4 py-2">
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleCreate)}
                placeholder="email@example.com"
                className="bg-neutral-900 border border-neutral-700 px-2 py-1 rounded text-sm w-full focus:outline-none focus:border-blue-500 transition-colors placeholder:text-neutral-600"
              />
            </td>
            <td className="px-4 py-2">
              <span className="text-neutral-500 text-xs">active</span>
            </td>
            <td className="px-4 py-2 text-right">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !newEmail.trim()}
                className="text-emerald-400 hover:text-emerald-300 disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors text-xs font-medium"
              >
                Add
              </button>
            </td>
          </tr>

          <AnimatePresence mode="popLayout">
            {users.map((user) => {
              const isUpdated = recentlyUpdated.has(user.userId);
              return (
                <motion.tr
                  key={user.userId}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    backgroundColor: isUpdated ? "rgba(16, 185, 129, 0.15)" : "transparent",
                  }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="border-b border-neutral-800 last:border-b-0 hover:bg-neutral-800/50 transition-colors"
                >
                  <td className="px-4 py-2 font-medium">
                    <EditableCell
                      userId={user.userId}
                      field="name"
                      value={user.name}
                      onUpdate={handleUpdate}
                    />
                  </td>
                  <td className="px-4 py-2 text-neutral-400 font-mono text-xs">
                    <EditableCell
                      userId={user.userId}
                      field="email"
                      value={user.email}
                      onUpdate={handleUpdate}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => cycleStatus(user)}
                      className={`text-xs font-medium ${statusColors[user.status]} hover:opacity-80 transition-opacity cursor-pointer`}
                    >
                      {user.status}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(user.userId)}
                      className="text-neutral-500 hover:text-red-400 transition-colors text-xs"
                    >
                      &times;
                    </button>
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>

      {users.length === 0 && (
        <div className="text-center py-8 text-neutral-500 text-sm">
          No users yet. Add one above.
        </div>
      )}
    </div>
  );
}
