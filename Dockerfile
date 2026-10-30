# Образ для хостинга. Не проверялся на этой машине (Docker не установлен): проверьте сборку на своём сервере.
FROM node:24-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Миграции БД выполняются отдельной командой перед запуском: docker run --rm --env-file .env <образ> npm run db:migrate
CMD ["npm", "run", "start"]
