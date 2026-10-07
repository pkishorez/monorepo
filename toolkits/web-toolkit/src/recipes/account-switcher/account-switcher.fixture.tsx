import { useState } from 'react';

import {
  AccountSwitcher,
  type AccountsView,
  type SignedInAccount,
} from './index';

const people: ReadonlyArray<SignedInAccount> = [
  { id: 'ada', name: 'Ada Lovelace', email: 'ada@example.com' },
  { id: 'grace', name: 'Grace Hopper', email: 'grace@example.com' },
  { id: 'mary', name: 'Mary Somerville', email: 'mary@example.com' },
];

const pause = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

/** Switches, signs out, and adds for real, up to every fixture account. */
function Live() {
  const [ids, setIds] = useState(['ada', 'grace']);
  const [activeId, setActiveId] = useState('ada');
  const byId = (id: string) => people.find((person) => person.id === id)!;
  if (ids.length === 0) return <p className="p-6 text-sm">Signed out.</p>;
  const accounts: AccountsView = {
    active: byId(activeId),
    others: ids.filter((id) => id !== activeId).map(byId),
    canAdd: ids.length < people.length,
    onSwitch: async (id) => {
      await pause();
      setActiveId(id);
    },
    onAdd: () => {
      const next = people.find((person) => !ids.includes(person.id));
      if (!next) return;
      setIds([...ids, next.id]);
      setActiveId(next.id);
    },
    onSignOut: async () => {
      await pause();
      const rest = ids.filter((id) => id !== activeId);
      setIds(rest);
      if (rest[0]) setActiveId(rest[0]);
    },
    onSignOutAll: async () => {
      await pause();
      setIds([]);
    },
  };
  return (
    <div className="p-6">
      <AccountSwitcher accounts={accounts} />
    </div>
  );
}

export default { Live: <Live /> };
