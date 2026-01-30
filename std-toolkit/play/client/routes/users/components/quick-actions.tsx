import { type User } from "../../../../domain";
import { usersCollection } from "../../../collections/users";
import { generateRandomUser } from "../utils/generate-user";
import { useUsersStore } from "../store";

interface QuickActionsProps {
  users: User[];
}

export function QuickActions({ users }: QuickActionsProps) {
  const { markUpdated } = useUsersStore();

  const handleAddRandom = () => {
    for (let i = 0; i < 10; i++) {
      const user = generateRandomUser();
      usersCollection.insert(user);
      markUpdated(user.userId);
    }
  };

  const handleDeleteAll = () => {
    users.forEach((user) => usersCollection.delete(user.userId));
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleAddRandom}
        className="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
      >
        + Add 10
      </button>
      {users.length > 0 && (
        <>
          <span className="text-neutral-700">|</span>
          <button
            onClick={handleDeleteAll}
            className="text-neutral-500 hover:text-red-400 text-xs transition-colors"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  );
}
