/**
 * ACTIVITY LOG
 *
 * Client-side log that narrates the event flow as it happens.
 * Each step of the Saga is logged here so you can see:
 *   1. Order created
 *   2. Kafka event published: order.created
 *   3. Services processing in parallel…
 *   4. Saga completed (CONFIRMED or FAILED)
 *   5. Follow-up events published
 *
 * This is the closest we get to distributed tracing without Jaeger/Zipkin.
 */

import { useEffect, useRef } from 'react';
import type { LogEntry } from '../types';

interface Props {
  entries: LogEntry[];
  onClear: () => void;
}

const ICON: Record<LogEntry['type'], string> = {
  info:    '→',
  success: '✓',
  error:   '✗',
  warning: '⚠',
};

export default function ActivityLog({ entries, onClear }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest entry
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="card log-card">
      <div className="card-header">
        <h2 className="card-title">Saga Event Log</h2>
        <button className="btn-ghost" onClick={onClear}>Clear</button>
      </div>

      <div className="log-body">
        {entries.length === 0 ? (
          <p className="empty-state">Events will appear here as the Saga runs…</p>
        ) : (
          entries.map(entry => (
            <div key={entry.id} className={`log-entry log-${entry.type}`}>
              <span className="log-time">{entry.timestamp}</span>
              <span className="log-icon">{ICON[entry.type]}</span>
              <span className="log-msg">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
