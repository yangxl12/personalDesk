FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run check && npm run build && npm prune --omit=dev

FROM node:24.18.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
RUN install -d -m 0700 -o node -g node /app/data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/src/lib/server/db ./src/lib/server/db
COPY --from=build /app/src/lib/server/auth/password.mjs ./src/lib/server/auth/password.mjs
COPY --from=build /app/scripts ./scripts
USER node
EXPOSE 3000
CMD ["node", "build"]
