# ---- Stage 1: Build frontend ----
FROM node:22.14.0-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Production image ----
FROM node:22.14.0-alpine
WORKDIR /app

# Backend dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Backend source
COPY backend/ ./

# Frontend dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Data directories will be mounted as volumes
RUN mkdir -p /app/data/db /app/data/uploads

EXPOSE 3000
CMD ["node", "server.js"]
