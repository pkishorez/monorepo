import { toast } from '@kstackz/ui-toolkit/components/ui/sonner';
import { useRef, useState } from 'react';
import { arrival, type Mail, MAILS, type Place } from './data.ts';

/** How long a refresh takes to bring new mail. */
const REFRESH_MS = 1000;

/**
 * The mail, and everything done to it. Moving or deleting mail offers Undo
 * in a toast.
 */
export function useMailbox() {
  const [mails, setMails] = useState<ReadonlyArray<Mail>>(MAILS);
  const arrived = useRef(0);

  const patch = (id: string, change: Partial<Mail>) =>
    setMails((all) => all.map((m) => (m.id === id ? { ...m, ...change } : m)));

  const move = (mail: Mail, to: Place, label: string) => {
    patch(mail.id, { folder: to });
    toast(label, {
      action: {
        label: 'Undo',
        onClick: () => patch(mail.id, { folder: mail.folder }),
      },
    });
  };

  const find = (id: string) => mails.find((m) => m.id === id);

  return {
    mails,
    find,
    setRead: (id: string, read: boolean) => patch(id, { unread: !read }),
    toggleRead: (id: string) => {
      const mail = find(id);
      if (mail !== undefined) patch(id, { unread: !mail.unread });
    },
    toggleStar: (id: string) => {
      const mail = find(id);
      if (mail !== undefined) patch(id, { starred: !mail.starred });
    },
    /** Archives it, or brings it back to the inbox from the archive. */
    archive: (id: string) => {
      const mail = find(id);
      if (mail === undefined) return;
      if (mail.folder === 'archive') move(mail, 'inbox', 'Moved to Inbox');
      else move(mail, 'archive', 'Archived');
    },
    /** Moves it to the trash, or deletes it for good from there. */
    remove: (id: string) => {
      const index = mails.findIndex((m) => m.id === id);
      const mail = mails[index];
      if (mail === undefined) return;
      if (mail.folder !== 'trash') return move(mail, 'trash', 'Moved to Trash');
      setMails((all) => all.filter((m) => m.id !== id));
      toast('Deleted', {
        action: {
          label: 'Undo',
          onClick: () => setMails((all) => all.toSpliced(index, 0, mail)),
        },
      });
    },
    /** One or two new mails at the top of the inbox, after a moment. */
    refresh: () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          const count = 1 + Math.round(Math.random());
          const fresh = Array.from({ length: count }, () =>
            arrival(arrived.current++),
          );
          setMails((all) => [...fresh, ...all]);
          resolve();
        }, REFRESH_MS),
      ),
    send: (to: string, subject: string, body: string) => {
      setMails((all) => [
        {
          id: `sent${Date.now()}`,
          from: to,
          email: to,
          subject: subject || '(No subject)',
          body: body || ' ',
          time: 'Now',
          unread: false,
          starred: false,
          folder: 'sent',
        },
        ...all,
      ]);
      toast('Sent');
    },
  };
}

export type Mailbox = ReturnType<typeof useMailbox>;
