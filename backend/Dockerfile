# Use Node.js 18 LTS for better compatibility
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache python3 make g++

# Install dependencies
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Copy source files
COPY *.js ./
COPY *.ts ./
COPY middleware ./middleware
COPY routes ./routes
COPY src ./src

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# Production stage
FROM base AS runner
WORKDIR /app

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

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node --eval "require('http').createServer((req, res) => res.end('OK')).listen(3000)" || exit 1

# Start the application
CMD ["npm", "start"]
