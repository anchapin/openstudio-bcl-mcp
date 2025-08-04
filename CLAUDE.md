# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains the Product Requirements Document (PRD) for OpenStudio MCP Server 2.0, a Model Context Protocol (MCP) server that enables AI systems to interact with OpenStudio's building energy modeling tools via natural language.

The project aims to address gaps in the legacy openstudio-mcp project by providing a standardized interface for AI-driven energy modeling tasks with modern software engineering practices.

## Key Features

1. **MCP Integration**: Expose OpenStudio CLI commands via MCP's `tools` and `prompts` APIs
2. **Use Case Support**: Generate energy models from natural language, validate models against ASHRAE 90.1, export results to Radiance for daylight analysis
3. **Modern Stack**: TypeScript, Express.js, and Docker for cross-platform support
4. **Documentation**: Auto-generated API docs (Swagger/OpenAPI) and integration tutorials
5. **CI/CD**: GitHub Actions for linting, testing, and Docker image publishing

## Common Development Commands

Based on the existing openstudio-mcp project structure, these are the likely commands for development:

### Development
```bash
npm run dev          # Start development server with hot reloading
npm run build        # Build the project
npm start            # Start the server
```

### Testing
```bash
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

### Code Quality
```bash
npm run lint         # Lint the code
npm run format       # Format the code
```

### Packaging
```bash
npm run package:all  # Package for all platforms (Windows, macOS, Linux)
npm run package:win  # Package for Windows
npm run package:mac  # Package for macOS
npm run package:linux # Package for Linux
```

## Architecture Overview

The system follows this architecture pattern:
```
[AI Client] ↔ [MCP Server] ↔ [OpenStudio CLI]
               │
               ├─ Input: Natural language → Structured parameters
               └─ Output: EnergyPlus results, Radiance visualizations
```

Key components likely include:
- MCP Server implementation handling WebSocket/REST communication
- OpenStudio CLI command processors
- BCL (Building Component Library) template services
- Measure application services
- Model creation and simulation services
- Request routing and response formatting

## Dependencies

- Node.js v18+
- OpenStudio CLI installed locally or via Docker
- TypeScript for development
- Express.js for REST APIs
- Fastify for performance-critical endpoints

## Testing Framework

- Vitest for unit and integration testing
- Coverage reporting with @vitest/coverage-v8
- Test scripts for various scenarios including hanging test fixes

## CI/CD

GitHub Actions workflows handle:
- Continuous integration (linting, building, testing)
- Release packaging for multiple platforms
- Docker image building and publishing
- Dependency security scanning