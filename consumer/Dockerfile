FROM node:18-alpine
WORKDIR /app
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists*
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3000
EXPOSE 50051
CMD ["node", "consumer/app.js"]