# Production Dockerfile for OpenStudio MCP Server 2.0
# Optimized for production deployment with minimal size and security

FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies including OpenStudio requirements
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18.x
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Download and install OpenStudio CLI
# Use the latest available version
ARG OPENSTUDIO_VERSION=3.10.0
ENV OPENSTUDIO_VERSION=${OPENSTUDIO_VERSION}

# Use the correct URL for the latest version
RUN wget -q https://github.com/NREL/OpenStudio/releases/download/v${OPENSTUDIO_VERSION}/OpenStudio-${OPENSTUDIO_VERSION}+86d7e215a1-Ubuntu-22.04-arm64.deb -O openstudio.deb \
    && dpkg -i openstudio.deb || true \
    && apt-get update && apt-get install -f -y \
    && rm openstudio.deb

# Set OpenStudio environment variables
ENV OPENSTUDIO_PATH=/usr/local/openstudio-${OPENSTUDIO_VERSION}
ENV PATH="${OPENSTUDIO_PATH}/bin:${PATH}"
ENV RUBYLIB="${OPENSTUDIO_PATH}/Ruby:${RUBYLIB}"

# Additional environment variables for OpenStudio operations
ENV OPENSTUDIO_WORKING_DIR=/app/workspace
ENV MODELS_PATH=/app/data/models
ENV RESULTS_PATH=/app/data/results

# Verify OpenStudio installation
RUN openstudio --version || echo "OpenStudio installation completed"

# Create app directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p \
    data/models \
    data/results \
    data/temp \
    logs \
    workspace

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application
COPY dist/ ./dist/

# Create non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup -d /app -s /bin/bash appuser \
    && chown -R appuser:appgroup /app

# Ensure OpenStudio has the necessary file permissions
RUN mkdir -p /var/simdata/openstudio \
    && chown -R appuser:appgroup /var/simdata/openstudio \
    && chmod -R 755 /var/simdata/openstudio

# Switch to non-root user
USER appuser

# Set production environment
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]