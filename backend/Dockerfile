# Use Node.js 18 LTS for better compatibility
FROM node:18-alpine AS base

# Build stage
FROM base AS builder
WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ openssl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# Copy source files
COPY *.js ./
COPY *.ts ./
COPY middleware ./middleware
COPY routes ./routes
COPY src ./src

# Production stage
FROM base AS runner
WORKDIR /app

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup -S app && adduser -S -G app app

# Copy built application
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package*.json ./
COPY --from=builder --chown=app:app /app/prisma ./prisma/
COPY --from=builder --chown=app:app /app/*.js ./
COPY --from=builder --chown=app:app /app/*.ts ./
COPY --from=builder --chown=app:app /app/middleware ./middleware
COPY --from=builder --chown=app:app /app/routes ./routes
COPY --from=builder --chown=app:app /app/src ./src

# Switch to non-root user
USER app

# Expose port
EXPOSE 3000

# Health check (uses CJS eval which works in all contexts)
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD node --eval "require('http').get('http://localhost:3000/', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))" || exit 1

# Start the application
CMD ["node", "server.js"]
