# Multi-stage Dockerfile for the Convention Speaker List Manager

# Stage 1: Base dependencies
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Stage 2: Development
FROM base AS development
ENV NODE_ENV=development

# Install all dependencies
RUN npm ci
RUN cd backend && npm ci
RUN cd frontend && npm ci
RUN cd shared && npm ci

# Copy source code
COPY . .

# Build shared package
RUN cd shared && npm run build

# Expose ports
EXPOSE 3001 5173

# Start development servers
CMD ["npm", "run", "dev"]

# Stage 3: Builder
FROM base AS builder
ENV NODE_ENV=production

# Install production dependencies
RUN npm ci --only=production
RUN cd backend && npm ci --only=production
RUN cd frontend && npm ci --only=production
RUN cd shared && npm ci --only=production

# Copy source code
COPY . .

# Build all packages
RUN cd shared && npm run build
RUN cd backend && npm run build
RUN cd frontend && npm run build

# Stage 4: Production
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/backend/dist ./backend/dist
COPY --from=builder --chown=nodejs:nodejs /app/backend/node_modules ./backend/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/frontend/dist ./frontend/dist
COPY --from=builder --chown=nodejs:nodejs /app/shared/dist ./shared/dist

# Copy necessary config files
COPY --from=builder --chown=nodejs:nodejs /app/backend/package.json ./backend/
COPY --from=builder --chown=nodejs:nodejs /app/frontend/package.json ./frontend/
COPY --from=builder --chown=nodejs:nodejs /app/shared/package.json ./shared/

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "backend/dist/index.js"]