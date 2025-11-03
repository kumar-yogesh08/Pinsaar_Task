FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY src ./src

ENV NODE_ENV=production

EXPOSE 4000

CMD ["npm", "start"]