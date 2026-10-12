FROM node:22-bookworm-slim
# Compiler und Python für die Code-Ausführung
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc g++ libc6-dev python3 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV PORT=3000 WORKSPACE=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "server.js"]
