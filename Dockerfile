FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/src/scripts ./src/scripts
COPY --from=build /app/scripts/bridge-crossings.mjs ./scripts/bridge-crossings.mjs
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server.mjs /app/eng.traineddata ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:5173/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
