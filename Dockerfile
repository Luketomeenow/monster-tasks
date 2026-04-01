# Official Node image includes runtime libs; avoids Nixpacks apt-get install libatomic1
# (that step often fails on Railway when deb.debian.org is unreachable from the builder).
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
