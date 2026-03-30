import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ActivityLog from './components/ActivityLog';
import CreateOrderForm from './components/CreateOrderForm';
import InventoryPanel from './components/InventoryPanel';
import OrderTracker from './components/OrderTracker';
import type { LogEntry, Order } from './types';

export default function App() {
  const [latestOrder, setLatestOrder] = useState<Order | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLog(prev => [
      ...prev,
      {
        ...entry,
        id: uuidv4(),
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1>Microservices Dashboard</h1>
          <div className="header-links">
            <a href="http://localhost:8080" target="_blank" rel="noreferrer">Kafka UI</a>
            <a href="http://localhost:3000/health" target="_blank" rel="noreferrer">Gateway Health</a>
          </div>
        </div>
        <p className="header-sub">
          E-Commerce · Choreography Saga · Apache Kafka · 5 Services
        </p>
      </header>

      <main className="main">
        {/* Top row: form (left) + orders (right) */}
        <div className="top-row">
          <CreateOrderForm
            onOrderCreated={(order) => {
              setLatestOrder(order);
            }}
            onLog={addLog}
          />
          <OrderTracker newOrder={latestOrder} onLog={addLog} />
        </div>

        {/* Bottom row: inventory (left) + event log (right) */}
        <div className="bottom-row">
          <InventoryPanel />
          <ActivityLog entries={log} onClear={() => setLog([])} />
        </div>
      </main>
    </div>
  );
}
