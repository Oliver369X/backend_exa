FROM node:20-bullseye
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm run start:migrate
EXPOSE 4000
CMD ["node", "dist/app.js"]