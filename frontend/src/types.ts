/**
 * Shared TypeScript types — mirrors the data shapes from our microservices.
 * Having these in one place means any API change shows as a TS error immediately.
 */

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export interface Order {
  id: string;
  customer_id: string;
  product_id: string;
  quantity: number;
  amount: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderPayload {
  customer_id: string;
  product_id: string;
  quantity: number;
  amount: number;
}

export interface Product {
  id: string;
  name: string;
  stock: number;
}

// Activity log entry — tracked client-side to show the event flow
export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}
