import { type User } from "../../../../domain";
import { EditUserForm } from "./edit-user-form";

interface UserItemProps {
  user: User;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (id: string, updates: Partial<User>) => void;
  onCancelEdit: () => void;
}

export function UserItem({
  user,
  isEditing,
  onEdit,
  onSave,
  onCancelEdit,
}: UserItemProps) {
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const statusStyles = {
    active: "bg-green-500/20 text-green-400",
    pending: "bg-yellow-500/20 text-yellow-400",
    inactive: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="bg-neutral-800/50 border border-neutral-700 p-4 rounded-xl flex items-center gap-4 hover:border-neutral-600 transition-colors">
      {isEditing ? (
        <EditUserForm user={user} onSave={onSave} onCancel={onCancelEdit} />
      ) : (
        <>
          <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center font-medium text-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{user.name}</div>
            <div className="text-neutral-400 text-sm truncate">{user.email}</div>
          </div>
          <span
            className={`text-xs px-3 py-1.5 rounded-full font-medium ${statusStyles[user.status]}`}
          >
            {user.status}
          </span>
          <button
            onClick={onEdit}
            className="bg-neutral-700 hover:bg-neutral-600 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
          >
            Edit
          </button>
        </>
      )}
    </div>
  );
}
