FROM node:20-bullseye
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npx prisma -- db push
RUN npm run build
EXPOSE 4000
CMD ["node", "dist/app.js"]