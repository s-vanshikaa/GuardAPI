# Dev-mode image: hot-reloads from a bind-mounted source tree via
# docker-compose (see ../docker-compose.yml). Not a production build —
# that's Ticket 20's job.
FROM node:22-slim

# openssl: required by Prisma's query engine.
# python3/make/g++: bcrypt falls back to compiling from source when no
# prebuilt binary matches the container's platform (e.g. arm64 hosts).
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN chmod +x docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]
