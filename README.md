# E-Commerce Microservices with Apache Kafka

A production-pattern microservices system demonstrating:
- **Event-driven architecture** via Apache Kafka
- **Choreography Saga** for distributed transactions
- **Database per service** pattern
- **Idempotent consumers** for at-least-once delivery safety
- **API Gateway** as single public entry point

---

## Architecture

```
                        ┌─────────────────┐
         HTTP           │   API Gateway   │  :3000
  Client ──────────────▶│  (entry point)  │
                        └────────┬────────┘
                                 │ proxy
                                 ▼
                        ┌─────────────────┐
                        │  Order Service  │  :3001
                        │  (SQLite DB)    │
                        └────────┬────────┘
                                 │ publishes
                                 ▼
                     ┌───────────────────────┐
                     │   Kafka Topic:        │
                     │   order.created       │
                     └──────────┬────────────┘
                                │ consumed by (parallel)
               ┌────────────────┴────────────────┐
               ▼                                 ▼
  ┌────────────────────┐             ┌────────────────────┐
  │  Payment Service   │  :3002      │ Inventory Service  │  :3003
  │  (SQLite DB)       │             │  (SQLite DB)       │
  └─────────┬──────────┘             └─────────┬──────────┘
            │ publishes                        │ publishes
            ▼                                  ▼
  payment.processed                   inventory.reserved
            │                                  │
            └──────────────┬───────────────────┘
                           ▼ both consumed by
                  ┌─────────────────┐
                  │  Order Service  │ (Saga Consumer)
                  │  evaluates both │
                  └────────┬────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
   order.completed                   order.failed
            │                             │
            └──────────────┬──────────────┘
                           ▼
                ┌─────────────────────┐
                │ Notification Service│  :3004
                │ (sends email/SMS)   │
                └─────────────────────┘
                           │
              order.failed also consumed by
                           ▼
                ┌─────────────────────┐
                │  Inventory Service  │
                │ releases reserved   │
                │ stock (compensating │
                │ transaction)        │
                └─────────────────────┘
```

---

## Kafka Topics

| Topic | Publisher | Consumers | Purpose |
|---|---|---|---|
| `order.created` | order-service | payment-service, inventory-service | Starts the saga |
| `payment.processed` | payment-service | order-service | Payment result (SUCCESS/FAILED) |
| `inventory.reserved` | inventory-service | order-service | Stock result (RESERVED/INSUFFICIENT) |
| `order.completed` | order-service | notification-service | Happy path — order confirmed |
| `order.failed` | order-service | notification-service, inventory-service | Sad path — triggers compensating tx |

---

## Saga Flow

### Happy Path (payment ≤ $1000, product in stock)
```
1. POST /orders           → order saved, status=PENDING
2. order.created          → published to Kafka
3. payment-service        → processes payment → SUCCESS → publishes payment.processed
4. inventory-service      → reserves stock → RESERVED → publishes inventory.reserved
5. order-service (saga)   → receives both → CONFIRMED → publishes order.completed
6. notification-service   → sends confirmation email
```

### Failure Path (payment > $1000 or out of stock)
```
1. POST /orders           → order saved, status=PENDING
2. order.created          → published to Kafka
3. payment-service        → amount>$1000 → FAILED → publishes payment.processed
4. inventory-service      → reserves stock → publishes inventory.reserved
5. order-service (saga)   → payment FAILED → FAILED → publishes order.failed
6. inventory-service      → receives order.failed → RELEASES stock (compensating tx)
7. notification-service   → sends failure email
```

---

## Run Locally

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 18+ (only needed if running services outside Docker)

### Start everything
```bash
docker compose up --build
```

### Services
| Service | URL |
|---|---|
| API Gateway | http://localhost:3000 |
| Kafka UI (dashboard) | http://localhost:8080 |
| Order Service (direct) | http://localhost:3001 |
| Inventory Service (direct) | http://localhost:3003 |

### Create an order (happy path — amount ≤ 1000)
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust-123",
    "product_id": "prod-001",
    "quantity": 1,
    "amount": 299.99
  }'
```

### Create an order (failure path — amount > 1000)
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "cust-456",
    "product_id": "prod-002",
    "quantity": 1,
    "amount": 1500.00
  }'
```

### Check order status
```bash
curl http://localhost:3000/orders/{orderId}
```

### Check inventory levels
```bash
curl http://localhost:3003/inventory
```

---

## Key Patterns (Interview Reference)

| Pattern | Where | Why |
|---|---|---|
| **Choreography Saga** | order + payment + inventory services | Distributed transaction without central coordinator |
| **Compensating Transaction** | inventory-service on order.failed | Undoes partial work when saga fails |
| **Database per Service** | Each service has its own SQLite | No shared DB = independent deployments |
| **Idempotent Consumer** | payment-service, inventory-service | Safe against Kafka at-least-once redelivery |
| **Consumer Groups** | All consumers | Kafka ensures one instance processes each message |
| **Event-Driven Decoupling** | All services | Services don't call each other directly |
| **Message Key Ordering** | All producers (key=orderId) | All events for one order go to same partition → ordered |

---

## Commit History (read in order to learn)

| Commit | What it teaches |
|---|---|
| `chore: project structure` | Docker Compose, Kafka + Zookeeper setup |
| `feat(api-gateway)` | API Gateway routing pattern |
| `feat(order-service): REST API` | Database-per-service, order state machine |
| `feat(order-service): publish event` | How to produce a Kafka event, message keys |
| `feat(payment-service)` | Event consumer, idempotency, consumer groups |
| `feat(inventory-service)` | Compensating transaction, atomic DB operations |
| `feat(order-service): Saga` | Saga completion, waiting for multiple events |
| `feat(notification-service)` | Purely reactive service, open/closed principle |
