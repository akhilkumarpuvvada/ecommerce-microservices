FROM node:18-alpine
# better-sqlite3 needs build tools to compile native bindings
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY src/ ./src/
EXPOSE 3001
CMD ["node", "src/index.js"]
