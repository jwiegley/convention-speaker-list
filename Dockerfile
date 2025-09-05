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

# Install all dependencies using workspaces
RUN npm ci --workspaces --include-workspace-root

# Install common dev tools globally to avoid path issues
RUN npm install -g vite@7.1.2 nodemon@3.0.2 ts-node@10.9.2 typescript@5.3.3

# Copy source code
COPY . .

# Build shared package
RUN npm run build:shared

# Expose ports
EXPOSE 3001 5173

# Start development servers
CMD ["npm", "run", "dev"]

# Stage 3: Builder
FROM base AS builder
ENV NODE_ENV=production

# Install all dependencies (including dev dependencies for building)  
RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY . .

# Build shared package only (frontend will be served in development mode)
RUN npm run build:shared

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
COPY --from=builder --chown=nodejs:nodejs /app/backend/src ./backend/src
COPY --from=builder --chown=nodejs:nodejs /app/shared/dist ./shared/dist

# Copy necessary config files
COPY --from=builder --chown=nodejs:nodejs /app/backend/package.json ./backend/
COPY --from=builder --chown=nodejs:nodejs /app/backend/tsconfig.json ./backend/
COPY --from=builder --chown=nodejs:nodejs /app/frontend/package.json ./frontend/
COPY --from=builder --chown=nodejs:nodejs /app/shared/package.json ./shared/
COPY --from=builder --chown=nodejs:nodejs /app/tsconfig.json ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the application using ts-node
CMD ["npx", "ts-node", "backend/src/index.ts"]