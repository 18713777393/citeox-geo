FROM node:20-bookworm-slim

WORKDIR /app/backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci

COPY backend/prisma ./prisma
RUN npm run prisma:generate

COPY backend ./
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8787

CMD ["sh", "-c", "npx prisma migrate deploy && npm run prisma:seed && npm run start:prod"]
