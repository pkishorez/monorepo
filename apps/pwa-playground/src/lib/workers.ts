import { useEffect, useState } from 'react';

export interface WorkerSnapshot {
  readonly supported: boolean;
  readonly controller: string;
  readonly active: string;
  readonly waiting: string;
  readonly installing: string;
}

const describeWorker = (worker: ServiceWorker | null | undefined) =>
  worker ? `${worker.state} ${new URL(worker.scriptURL).pathname}` : 'none';

export const readWorkers = async (): Promise<WorkerSnapshot> => {
  const container = navigator.serviceWorker;
  if (container === undefined) {
    return {
      supported: false,
      controller: 'none',
      active: 'none',
      waiting: 'none',
      installing: 'none',
    };
  }
  const registration = await container.getRegistration();
  return {
    supported: true,
    controller: describeWorker(container.controller),
    active: describeWorker(registration?.active),
    waiting: describeWorker(registration?.waiting),
    installing: describeWorker(registration?.installing),
  };
};

/** The tab's workers, re-read every two seconds and on controller change; null until the first read. */
export const useWorkers = (): WorkerSnapshot | null => {
  const [workers, setWorkers] = useState<WorkerSnapshot | null>(null);
  useEffect(() => {
    const refresh = () => void readWorkers().then(setWorkers);
    refresh();
    const timer = setInterval(refresh, 2000);
    navigator.serviceWorker?.addEventListener('controllerchange', refresh);
    return () => {
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener('controllerchange', refresh);
    };
  }, []);
  return workers;
};
