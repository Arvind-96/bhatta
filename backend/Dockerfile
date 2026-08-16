FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 compiles a native binary at install time
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "run", "start"]
