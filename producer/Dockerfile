FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY producer ./producer
COPY proto ./proto

CMD ["node", "producer/app.js"]