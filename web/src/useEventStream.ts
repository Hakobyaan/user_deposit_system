import { useEffect, useRef, useState } from 'react';
import { eventsApi, type TraceEvent } from './api';

const POLL_MS = 1000;

/**
 * Polls /events and keeps the newest `max` events, newest first.
 * `baseline` is the highest id that existed when the stream started, so
 * callers can tell "happened while I was watching" from backlog.
 */
export function useEventStream({ enabled = true, max = 1000 } = {}) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [online, setOnline] = useState(true);
  const [baseline, setBaseline] = useState<number | null>(null);
  const lastId = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const { events: fresh } = await eventsApi.list(lastId.current);
        if (stopped) return;
        setOnline(true);
        const maxId = Math.max(lastId.current, ...fresh.map((e) => e.id));
        setBaseline((b) => b ?? maxId);
        if (fresh.length) {
          lastId.current = maxId;
          const newestFirst = [...fresh].reverse();
          setEvents((xs) => [...newestFirst, ...xs].slice(0, max));
        }
      } catch {
        if (!stopped) setOnline(false);
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [enabled, max]);

  return { events, setEvents, online, baseline };
}
