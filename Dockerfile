# T2 als Standalone-Container (inkl. Node-Server).
# Build: docker build -t t2 .
# Start:  docker run --rm -p 3000:3000 --env-file .env -v t2-data:/app/data t2

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache bash rsync
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY scripts/standalone-bundle/start.sh ./start.sh
COPY .env.example ./.env.example
COPY scripts/standalone-bundle/START.md ./START.md

RUN chmod +x ./start.sh && mkdir -p /app/data

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "server.js"]
