# Stage 1: Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:22-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
# Copy tsconfig and nest-cli configs if any (using wildcard)
COPY tsconfig*.json nest-cli.json* ./
COPY backend/ ./backend/
RUN npm run build:backend

# Stage 3: Production Release
FROM node:22-alpine
WORKDIR /app

# Copy package config and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled backend
COPY --from=backend-builder /app/backend/dist ./backend/dist

# Copy compiled frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Set timezone
ENV TZ=Asia/Ho_Chi_Minh

# Expose port
EXPOSE 3456

# Start the application
CMD ["node", "backend/dist/main.js"]
