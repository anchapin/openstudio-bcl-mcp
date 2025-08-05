# CI/CD Pipeline Documentation

This document describes the CI/CD pipeline for the OpenStudio MCP Server 2.0 project.

## Overview

The CI/CD pipeline is implemented using GitHub Actions and consists of three main jobs:

1. **test**: Runs automated tests and code quality checks
2. **docker**: Builds and publishes Docker images
3. **release**: Creates GitHub releases for tagged commits

## Pipeline Details

### Test Job

The test job runs on every push to `main` and every pull request. It performs the following steps:

1. Checks out the code
2. Sets up Node.js (versions 18.x and 20.x)
3. Installs dependencies using `npm ci`
4. Runs type checking with `npm run type-check`
5. Runs linting with `npm run lint`
6. Runs tests with `npm test`
7. Builds the project with `npm run build`

### Docker Job

The Docker job builds and publishes container images to GitHub Container Registry (GHCR). It runs when code is pushed to `main` or when manually triggered. The job:

1. Sets up Docker Buildx
2. Authenticates with GHCR
3. Extracts Docker metadata (tags, labels)
4. Builds the Docker image using the multi-stage Dockerfile
5. Pushes the image to GHCR for non-PR events

The Docker image is tagged based on:

- Branch name for branch builds
- Pull request number for PR builds
- Semantic version for tags (e.g., `v1.2.3` creates tags `1.2.3` and `1.2`)

### Release Job

The release job automatically creates GitHub releases for tagged commits that start with `v`. It includes:

- Release notes with Docker image information
- Automated release creation without draft status

## Docker Images

The project includes both development and production Docker images:

- **Dockerfile.dev**: Development image with hot-reloading and debugging tools
- **Dockerfile**: Production image optimized for size and security

### Production Docker Image Features

1. Multi-stage build for smaller image size
2. Non-root user for security
3. Health checks for container orchestration
4. Environment variable configuration
5. Proper file permissions for OpenStudio operations

### Docker Compose

The project includes Docker Compose configurations for both development and production:

- `docker-compose.yml`: Development environment with hot-reloading
- `docker-compose.prod.yml`: Production environment with optimized settings

## Configuration

The pipeline uses several configuration files:

1. `.github/workflows/ci.yml`: Main workflow file
2. `Dockerfile`: Production Docker image definition
3. `Dockerfile.dev`: Development Docker image definition
4. `docker-compose.yml`: Development Docker Compose configuration
5. `docker-compose.prod.yml`: Production Docker Compose configuration

## Security Considerations

1. Docker images run as non-root users
2. Only necessary system dependencies are installed
3. Production dependencies only are installed in the production image
4. Health checks ensure container readiness
5. Secrets are used for registry authentication

## Usage

### Manual Pipeline Trigger

The pipeline can be manually triggered using the GitHub Actions UI or CLI.

### Automated Triggers

1. Push to `main` branch: Runs test and Docker jobs
2. Pull requests to `main`: Runs test job only
3. Tags starting with `v`: Runs all jobs including release creation

### Building Locally

To build the Docker image locally:

```bash
# Build development image
docker build -f Dockerfile.dev -t openstudio-mcp-server:dev .

# Build production image
docker build -t openstudio-mcp-server:latest .
```

### Running with Docker Compose

```bash
# Development
docker-compose up

# Production
docker-compose -f docker-compose.prod.yml up
```

## Monitoring and Debugging

The pipeline includes several monitoring features:

1. Build caching to speed up subsequent builds
2. Detailed logging for troubleshooting
3. Health checks in Docker images
4. Comprehensive test coverage

## Future Improvements

Potential enhancements to the CI/CD pipeline:

1. Add security scanning for dependencies and Docker images
2. Implement automated performance testing
3. Add integration tests that run against built Docker images
4. Set up automated deployment to cloud platforms
5. Add code coverage reporting and requirements
