FROM node:20-alpine

WORKDIR /opt/strapi

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=1337

RUN npm run build

EXPOSE 1337

CMD ["npm", "run", "start"]
