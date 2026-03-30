/**
 * API CLIENT
 *
 * All HTTP calls go through here — never call fetch() directly in components.
 * This makes it easy to swap the base URL, add auth headers, or mock in tests.
 *
 * In Docker:  calls go to nginx → nginx proxies to api-gateway
 * In dev:     calls go to Vite proxy → api-gateway at localhost:3000
 * Base URL is always '' (same origin) — proxy handles routing.
 */

import type { CreateOrderPayload, Order, Product } from './types';

const BASE = '';   // same-origin — vite dev proxy or nginx handles it

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Orders ────────────────────────────────────────────────────────────

export const createOrder = (payload: CreateOrderPayload) =>
  request<Order>('/orders', { method: 'POST', body: JSON.stringify(payload) });

export const getOrder = (id: string) =>
  request<Order>(`/orders/${id}`);

export const listOrders = () =>
  request<Order[]>('/orders');

// ── Inventory ─────────────────────────────────────────────────────────

export const listInventory = () =>
  request<Product[]>('/inventory');
