# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install pnpm and dependencies
RUN npm install -g pnpm@10.4.1
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install pnpm and production dependencies only
RUN npm install -g pnpm@10.4.1
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Copy necessary files
COPY drizzle ./drizzle
COPY server ./server
COPY shared ./shared
COPY storage ./storage

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/index.js"]
