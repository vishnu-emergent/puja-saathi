# ---- build the web app
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY web ./web
RUN npm run build

# ---- runtime: API + static files
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 CACHE_DIR=/app/.cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=web /app/dist ./dist
# Pre-warmed Sarvam translations/voice (npm run warm), so pods start instantly.
COPY .cach[e] ./.cache
RUN mkdir -p /app/.cache && chown -R node:node /app
USER node
EXPOSE 8787
CMD ["node", "server/index.js"]
