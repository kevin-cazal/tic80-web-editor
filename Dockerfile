# --- Build stage ---
FROM node:22-alpine AS app-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# WASM must already be in public/tic80/ (from tic80 builder step)
ARG BUILD_ID=dev
ENV BUILD_ID=${BUILD_ID}
RUN npm run build

# --- Serve stage ---
FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=app-builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
