FROM node:20-alpine

WORKDIR /app

# Install git and build tools for native modules
RUN apk add --no-cache git python3 make g++

# Copy package files and install
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD node -e "require('http').get('http://localhost:8000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "index.js"]
