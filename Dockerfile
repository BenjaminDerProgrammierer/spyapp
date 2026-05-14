# Step 1: Build Vite app
FROM node:22-slim AS client-build

WORKDIR /app

COPY client/package*.json ./

RUN npm ci

COPY client/ ./

RUN npm run build

# Step 2: Build the server image and copy the built Vite app
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl

WORKDIR /app

ENV NODE_ENV=production

COPY server/package*.json ./

RUN npm ci

COPY server/ ./

COPY --from=client-build /app/dist ./public

EXPOSE 3000
ENV PORT=3000

CMD ["npm", "start"]