# OpenStudio MCP Server API Documentation

This document provides detailed information about the MCP tools and endpoints available in the OpenStudio MCP Server.

## Available Tools

The OpenStudio MCP Server exposes the following tools that can be called via the MCP protocol:

### 1. create_energy_model

Create a new OpenStudio energy model from natural language description.

**Parameters:**

- `buildingType` (string, required): Type of building (office, residential, retail, etc.)
- `location` (string, required): Geographic location or climate zone
- `floorArea` (number, required): Total floor area in square meters
- `description` (string, required): Natural language description of the building

**Response:**

- Text response containing the model ID, building information, and output path

### 2. run_energy_simulation

Run an energy simulation on an existing model.

**Parameters:**

- `modelId` (string, required): ID of the energy model to simulate
- `weatherFile` (string, optional): Path to weather file (EPW format)
- `outputVariables` (array of strings, optional): List of output variables to include in results

**Response:**

- Text response containing the job ID, status, and output directory

### 3. validate_model_ashrae

Validate an energy model against ASHRAE 90.1 standards.

**Parameters:**

- `modelId` (string, required): ID of the energy model to validate
- `standard` (string, required): ASHRAE standard version to validate against (ASHRAE 90.1-2019, ASHRAE 90.1-2016, ASHRAE 90.1-2013)

**Response:**

- Text response containing validation results and compliance status

### 4. export_to_radiance

Export model geometry to Radiance for daylight analysis.

**Parameters:**

- `modelId` (string, required): ID of the energy model to export
- `includeWindows` (boolean, optional, default: true): Include window surfaces in export
- `materialProperties` (boolean, optional, default: true): Include material optical properties

**Response:**

- Text response containing export path and included elements

### 5. get_simulation_results

Retrieve results from a completed energy simulation.

**Parameters:**

- `jobId` (string, required): ID of the simulation job
- `format` (string, optional, default: json): Output format for results (json, csv, html)

**Response:**

- Text response containing simulation results in the specified format

## Environment Variables

The following environment variables can be configured to customize the behavior of the OpenStudio MCP Server:

### Core Configuration

- `OPENSTUDIO_PATH`: Path to the OpenStudio installation directory (default: `/usr/local/openstudio`)
- `MODELS_PATH`: Base directory for storing OpenStudio models (default: `./data/models`)
- `RESULTS_PATH`: Base directory for storing simulation results (default: `./data/results`)
- `WEATHER_PATH`: Base directory for weather files (default: `./data/weather`)

### Security Configuration

- `NODE_ENV`: Environment mode (development, production, test)
- `LOG_LEVEL`: Logging level (error, warn, info, debug, trace)

### Performance Configuration

- `TIMEOUT_DEFAULT`: Default timeout for CLI operations in milliseconds (default: 300000)

## Security Features

The OpenStudio MCP Server includes several security features to protect against common vulnerabilities:

### Command Injection Protection

All command line arguments are properly escaped to prevent command injection attacks.

### Path Traversal Protection

All file paths are validated against base directories to prevent directory traversal attacks.

### Input Validation

All input parameters are validated and sanitized before processing.

## Error Handling

The server uses standardized error responses with appropriate HTTP status codes and error messages to help with debugging and troubleshooting.

## CI/CD Pipeline

For information about the CI/CD pipeline, Docker images, and deployment processes, please refer to the [CI/CD documentation](./ci-cd.md).
