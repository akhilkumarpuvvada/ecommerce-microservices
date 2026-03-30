/**
 * CREATE ORDER FORM
 *
 * Lets you create an order and immediately see it in PENDING status.
 * After creation it calls onOrderCreated so the parent can start tracking it.
 *
 * Test scenarios:
 *   amount ≤ 1000  → CONFIRMED (happy path)
 *   amount > 1000  → FAILED    (payment declined — saga rollback)
 *   quantity > stock → FAILED  (insufficient inventory — saga rollback)
 */

import { useState } from 'react';
import { createOrder } from '../api';
import type { CreateOrderPayload, LogEntry, Order } from '../types';

interface Props {
  onOrderCreated: (order: Order) => void;
  onLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
}

// Pre-defined products matching the seeded inventory DB
const PRODUCTS = [
  { id: 'prod-001', name: 'Laptop  (50 in stock)' },
  { id: 'prod-002', name: 'Phone   (100 in stock)' },
  { id: 'prod-003', name: 'Tablet  (30 in stock)' },
];

const DEFAULT_FORM: CreateOrderPayload = {
  customer_id: 'cust-001',
  product_id: 'prod-001',
  quantity: 1,
  amount: 299,
};

export default function CreateOrderForm({ onOrderCreated, onLog }: Props) {
  const [form, setForm] = useState<CreateOrderPayload>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'amount' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    onLog({ type: 'info', message: `Creating order for ${form.customer_id} — $${form.amount}` });

    try {
      const order = await createOrder(form);
      onLog({ type: 'success', message: `Order ${order.id.slice(0, 8)}… created → status: PENDING` });
      onLog({ type: 'info', message: `Kafka event published: order.created` });
      onLog({ type: 'info', message: `payment-service + inventory-service processing in parallel…` });
      onOrderCreated(order);
    } catch (err) {
      onLog({ type: 'error', message: `Failed to create order: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">Create Order</h2>

      <div className="hint-box">
        <strong>Test Saga flows:</strong>
        <ul>
          <li>Amount ≤ $1,000 → payment succeeds → CONFIRMED</li>
          <li>Amount &gt; $1,000 → payment fails → FAILED + stock released</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Customer ID</label>
          <input name="customer_id" value={form.customer_id} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>Product</label>
          <select name="product_id" value={form.product_id} onChange={handleChange}>
            {PRODUCTS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Quantity</label>
            <input name="quantity" type="number" min={1} value={form.quantity} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Amount ($)</label>
            <input name="amount" type="number" min={1} step="0.01" value={form.amount} onChange={handleChange} required />
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Sending to API Gateway…' : 'Place Order'}
        </button>
      </form>
    </div>
  );
}
