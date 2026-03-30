/**
 * ORDER TRACKER
 *
 * Shows all orders and auto-polls PENDING ones every 2 seconds.
 * This makes the Saga visible in real time:
 *   You'll watch status flip from PENDING → CONFIRMED or FAILED
 *   as payment-service and inventory-service process events.
 */

import { useEffect, useRef, useState } from 'react';
import { getOrder, listOrders } from '../api';
import type { LogEntry, Order, OrderStatus } from '../types';

interface Props {
  newOrder: Order | null;      // set by parent when a new order is created
  onLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
}

const STATUS_CLASS: Record<OrderStatus, string> = {
  PENDING:   'badge badge-pending',
  CONFIRMED: 'badge badge-confirmed',
  FAILED:    'badge badge-failed',
};

export default function OrderTracker({ newOrder, onLog }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const pollingRef = useRef<Set<string>>(new Set());

  // Load all existing orders on mount
  useEffect(() => {
    listOrders().then(setOrders).catch(() => {});
  }, []);

  // When a new order is created, prepend it and start polling
  useEffect(() => {
    if (!newOrder) return;
    setOrders(prev => [newOrder, ...prev.filter(o => o.id !== newOrder.id)]);
    startPolling(newOrder.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newOrder]);

  function startPolling(orderId: string) {
    if (pollingRef.current.has(orderId)) return;
    pollingRef.current.add(orderId);

    const interval = setInterval(async () => {
      try {
        const updated = await getOrder(orderId);
        setOrders(prev => prev.map(o => o.id === orderId ? updated : o));

        if (updated.status !== 'PENDING') {
          // Saga completed — stop polling
          clearInterval(interval);
          pollingRef.current.delete(orderId);

          const shortId = orderId.slice(0, 8);
          if (updated.status === 'CONFIRMED') {
            onLog({ type: 'success', message: `Order ${shortId}… CONFIRMED — Saga completed successfully` });
            onLog({ type: 'info', message: `Kafka event published: order.completed → notification sent` });
          } else {
            onLog({ type: 'error', message: `Order ${shortId}… FAILED — Saga rolled back` });
            onLog({ type: 'warning', message: `Kafka event published: order.failed → inventory stock released` });
          }
        }
      } catch {
        clearInterval(interval);
        pollingRef.current.delete(orderId);
      }
    }, 2000);  // poll every 2 seconds
  }

  return (
    <div className="card">
      <h2 className="card-title">
        Orders
        {orders.some(o => o.status === 'PENDING') && (
          <span className="polling-indicator">polling…</span>
        )}
      </h2>

      {orders.length === 0 ? (
        <p className="empty-state">No orders yet. Create one to see the Saga in action.</p>
      ) : (
        <div className="order-list">
          {orders.map(order => (
            <div key={order.id} className={`order-row ${order.status === 'PENDING' ? 'order-row-pending' : ''}`}>
              <div className="order-id" title={order.id}>
                {order.id.slice(0, 8)}…
              </div>
              <div className="order-details">
                <span>{order.customer_id}</span>
                <span className="muted">·</span>
                <span>{order.product_id}</span>
                <span className="muted">·</span>
                <span>qty {order.quantity}</span>
                <span className="muted">·</span>
                <span>${order.amount}</span>
              </div>
              <span className={STATUS_CLASS[order.status]}>{order.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
