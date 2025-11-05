FROM node:18-alpine AS base

WORKDIR /app

#build admin static

FROM base AS build-admin

WORKDIR /app/admin

COPY ../admin/package.json ../admin/package-lock.json ./

RUN npm ci

COPY ../admin ./

RUN npm run build

# build api

FROM base AS api

WORKDIR /app/api

COPY ./api/package.json ./api/package-lock.json ./

RUN npm ci

COPY ./api/src ./src

# copy built admin to pulic/ served by Express

RUN mkdir -p ./public 

COPY --from=build-admin /app/admin/dist ./public


ENV NODE_ENV=production

EXPOSE 3000

CMD [ "npm", "start" ]