FROM nginxinc/nginx-unprivileged:stable-alpine

# Keep nginx proxy config versioned with the application code.
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080

USER 101:101

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/nginx-health >/dev/null || exit 1
