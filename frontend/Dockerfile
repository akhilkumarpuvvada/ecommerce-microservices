# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build
# Output: /app/dist

# ── Stage 2: Serve ──────────────────────────────────────────────
# nginx serves the static files and proxies /orders + /inventory
# to the api-gateway — same as vite dev proxy but for production
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
