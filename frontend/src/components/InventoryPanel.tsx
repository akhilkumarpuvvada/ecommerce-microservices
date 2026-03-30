/**
 * INVENTORY PANEL
 *
 * Shows live stock levels from inventory-service.
 * Refreshes every 5 seconds so you can watch stock drop when orders succeed
 * and bounce back when orders fail (compensating transaction in action).
 */

import { useEffect, useState } from 'react';
import { listInventory } from '../api';
import type { Product } from '../types';

export default function InventoryPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = () => {
    listInventory()
      .then(data => { setProducts(data); setLastRefresh(new Date()); })
      .catch(() => {});
  };

  // Refresh on mount and every 5 seconds
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const stockLevel = (stock: number) => {
    if (stock === 0) return 'stock-empty';
    if (stock <= 10) return 'stock-low';
    return 'stock-ok';
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Inventory</h2>
        <span className="muted" style={{ fontSize: '0.75rem' }}>
          refreshes every 5s · last: {lastRefresh.toLocaleTimeString()}
        </span>
      </div>

      <table className="inventory-table">
        <thead>
          <tr>
            <th>Product ID</th>
            <th>Name</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id}>
              <td className="muted">{p.id}</td>
              <td>{p.name}</td>
              <td><span className={`stock-badge ${stockLevel(p.stock)}`}>{p.stock}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="hint" style={{ marginTop: '0.75rem' }}>
        Watch stock drop on CONFIRMED orders. Failed orders release stock back.
      </p>
    </div>
  );
}
