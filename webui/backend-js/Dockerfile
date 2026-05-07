FROM node:20-alpine

WORKDIR /app

# Install git for sync operations
RUN apk add --no-cache git

# Copy package files and install
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy source
COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD node -e "require('http').get('http://localhost:8000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "index.js"]
