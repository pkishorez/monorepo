import { type User } from "../../../../domain";
import { usersCollection } from "../../../collections/users";
import { generateRandomUser } from "../utils/generate-user";

interface UserActionsProps {
  users: User[];
}

export function UserActions({ users }: UserActionsProps) {
  const handleAddRandom = () => {
    for (let i = 0; i < 20; i++) {
      usersCollection.insert(generateRandomUser());
    }
  };

  const handleDeleteAll = () => {
    users.forEach((user) => usersCollection.delete(user.userId));
  };

  return (
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
  );
}
