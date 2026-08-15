# Use Node.js 24 Alpine for smaller image size
FROM node:24-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Create data directory
RUN mkdir -p /app/data

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV DB_PATH=/app/data/cards.db

# Start the application
CMD ["npm", "start"]
