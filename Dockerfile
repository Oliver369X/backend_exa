FROM node:20-bullseye
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build
RUN npx prisma generate
EXPOSE 4000
CMD ["node", "dist/app.js"]