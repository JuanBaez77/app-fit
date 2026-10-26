# Imagen de producción de la web: build de la PWA y nginx que la sirve y hace proxy de /api.
# Contexto: la raíz del repo (docker-compose.prod.yml).
FROM node:22-alpine AS build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# tsc -b también revisa los tests, y el de métricas importa los fixtures compartidos con la API
COPY fixtures/ /fixtures/
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx/prod.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /web/dist /usr/share/nginx/html
