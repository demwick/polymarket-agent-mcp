FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ dist/
COPY .env.example .env.example

ENV NODE_ENV=production
ENV COPY_MODE=preview
ENV DAILY_BUDGET=20

ENTRYPOINT ["node", "dist/index.js"]
