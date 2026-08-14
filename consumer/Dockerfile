FROM node:18-bookworm

WORKDIR /app

RUN apt-get update \ && apt-get install -y ffmpeg \ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY consumer ./consumer
COPY proto ./proto

EXPOSE 3000
EXPOSE 50051
CMD ["node", "consumer/app.js"]