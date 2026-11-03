FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/social_db?schema=public" npx prisma generate

EXPOSE 3005

CMD ["npm", "start"]