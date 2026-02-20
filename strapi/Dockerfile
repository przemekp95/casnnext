FROM node:20-alpine

WORKDIR /opt/strapi

ARG STRAPI_ADMIN_PATH=/cms
ARG STRAPI_ADMIN_BACKEND_URL=/cms

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

COPY . .

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=1337 \
    STRAPI_ADMIN_PATH=${STRAPI_ADMIN_PATH} \
    STRAPI_ADMIN_BACKEND_URL=${STRAPI_ADMIN_BACKEND_URL}

RUN npm run build

EXPOSE 1337

CMD ["npm", "run", "start"]
