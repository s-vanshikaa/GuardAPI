# Dev-mode image: hot-reloads from a bind-mounted source tree via
# docker-compose (see ../docker-compose.yml). Not a production build —
# that's Ticket 20's job.
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# --host so the dev server binds 0.0.0.0 — bound to localhost only, it
# wouldn't be reachable through the container's published port.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
