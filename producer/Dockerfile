FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY producer ./producer
COPY proto ./proto

CMD ["node", "producer/app.js"]