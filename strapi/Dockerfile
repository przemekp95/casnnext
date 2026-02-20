FROM node:20-alpine3.21

WORKDIR /opt/strapi

ARG STRAPI_ADMIN_PATH=/cms
ARG STRAPI_ADMIN_BACKEND_URL=/cms

RUN apk upgrade --no-cache

# Prepare writable app directories for non-root runtime.
RUN mkdir -p /opt/strapi/public/uploads && chown -R node:node /opt/strapi

COPY --chown=node:node package.json package-lock.json* ./
USER node
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

COPY --chown=node:node . .

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=1337 \
    STRAPI_ADMIN_PATH=${STRAPI_ADMIN_PATH} \
    STRAPI_ADMIN_BACKEND_URL=${STRAPI_ADMIN_BACKEND_URL}

RUN npm run build

EXPOSE 1337

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const path = process.env.STRAPI_ADMIN_PATH || '/cms'; const url = 'http://127.0.0.1:' + (process.env.PORT || 1337) + path; fetch(url).then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1));"

CMD ["npm", "run", "start"]
