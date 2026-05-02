FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Use a simple HTTP server for production
FROM node:20-alpine
RUN npm install -g http-server

WORKDIR /app
COPY --from=0 /app/dist .

EXPOSE 5173

CMD ["http-server", "-p", "5173", "-c-1"]
