FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY bot.mjs ./
COPY ecosystem.config.cjs ./
ENV NODE_ENV=production
CMD ["node", "bot.mjs"]
