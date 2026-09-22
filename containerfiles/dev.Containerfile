FROM docker.io/library/node:24-slim

WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
