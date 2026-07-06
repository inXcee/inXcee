# ─── Stage 1: build ─────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/

RUN npm ci --workspace=frontend

COPY frontend ./frontend

# VITE_API_BASE_URL build sırasında inject edilir (default: /api → nginx proxy yapacak)
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build --workspace=frontend


# ─── Stage 2: nginx serve ───────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx/yys.conf /etc/nginx/conf.d/yys.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1
