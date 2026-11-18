# Borrowed Gravity: build the single-file game, then serve it with nginx on :8000
#   docker build -t borrowed-gravity .
#   docker run --rm -p 8000:8000 borrowed-gravity    →  http://localhost:8000

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY web ./web
COPY tools ./tools
RUN npm run check-levels && npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/borrowed-gravity.html /usr/share/nginx/html/index.html
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8000/healthz || exit 1
