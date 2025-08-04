#!/bin/bash
# Development Docker management script for OpenStudio MCP Server 2.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project configuration
PROJECT_NAME="openstudio-mcp"
COMPOSE_FILE="docker-compose.yml"
COMPOSE_DEV_FILE="docker-compose.dev.yml"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose >/dev/null 2>&1; then
        log_error "Docker Compose is not installed. Please install Docker Compose and try again."
        exit 1
    fi
}

# Function to build development images
build_dev() {
    log_info "Building development Docker images..."
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE build app-dev
    log_success "Development images built successfully!"
}

# Function to start development environment
start_dev() {
    log_info "Starting development environment..."
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE up -d app-dev redis
    
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Check if services are healthy
    if docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE ps | grep -q "Up (healthy)"; then
        log_success "Development environment started successfully!"
        log_info "Application is available at: http://localhost:3000"
        log_info "Health check: http://localhost:3000/health"
        log_info "API documentation: http://localhost:3000/api/v1"
        log_info "Debugger port: 9229"
    else
        log_warning "Services started but may not be fully healthy yet. Check status with 'status' command."
    fi
}

# Function to stop development environment
stop_dev() {
    log_info "Stopping development environment..."
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE down
    log_success "Development environment stopped successfully!"
}

# Function to restart development environment
restart_dev() {
    log_info "Restarting development environment..."
    stop_dev
    start_dev
}

# Function to show logs
logs_dev() {
    local service=${1:-app-dev}
    log_info "Showing logs for service: $service"
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE logs -f $service
}

# Function to show status
status_dev() {
    log_info "Development environment status:"
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE ps
}

# Function to enter shell in development container
shell_dev() {
    log_info "Opening shell in development container..."
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE exec app-dev bash
}

# Function to run tests
test_dev() {
    log_info "Running tests in development environment..."
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE run --rm test
}

# Function to run linting
lint_dev() {
    log_info "Running linting in development environment..."
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE exec app-dev npm run lint
}

# Function to format code
format_dev() {
    log_info "Formatting code in development environment..."
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE exec app-dev npm run format
}

# Function to clean up
cleanup_dev() {
    log_info "Cleaning up development environment..."
    docker-compose -f $COMPOSE_FILE -f $COMPOSE_DEV_FILE down -v --remove-orphans
    docker system prune -f
    log_success "Cleanup completed!"
}

# Function to show help
show_help() {
    cat << EOF
OpenStudio MCP Server 2.0 - Development Docker Management

Usage: $0 [COMMAND]

Commands:
    build       Build development Docker images
    start       Start development environment
    stop        Stop development environment
    restart     Restart development environment
    logs        Show logs (optional service name)
    status      Show status of all services
    shell       Open shell in development container
    test        Run tests
    lint        Run linting
    format      Format code
    cleanup     Clean up development environment and volumes
    help        Show this help message

Examples:
    $0 start                    # Start development environment
    $0 logs                     # Show app logs
    $0 logs redis              # Show Redis logs
    $0 shell                    # Open shell in app container
    $0 test                     # Run all tests
    
Environment Variables:
    COMPOSE_PROJECT_NAME        # Override project name (default: openstudio-mcp)
    
EOF
}

# Main script logic
main() {
    # Check prerequisites
    check_docker
    check_docker_compose
    
    # Handle commands
    case "${1:-help}" in
        build)
            build_dev
            ;;
        start)
            start_dev
            ;;
        stop)
            stop_dev
            ;;
        restart)
            restart_dev
            ;;
        logs)
            logs_dev $2
            ;;
        status)
            status_dev
            ;;
        shell)
            shell_dev
            ;;
        test)
            test_dev
            ;;
        lint)
            lint_dev
            ;;
        format)
            format_dev
            ;;
        cleanup)
            cleanup_dev
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"