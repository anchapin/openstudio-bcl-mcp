# OpenStudio MCP Server Configuration

This document describes the configuration options and environment variables for the OpenStudio MCP Server.

## Environment Variables

### Core Configuration Variables

| Variable | Description | Default Value | Required |
|----------|-------------|---------------|----------|
| `OPENSTUDIO_PATH` | Path to the OpenStudio installation directory | `/usr/local/openstudio` | No |
| `MODELS_PATH` | Base directory for storing OpenStudio models | `./data/models` | No |
| `RESULTS_PATH` | Base directory for storing simulation results | `./data/results` | No |
| `WEATHER_PATH` | Base directory for weather files | `./data/weather` | No |

### Security Configuration Variables

| Variable | Description | Default Value | Required |
|----------|-------------|---------------|----------|
| `NODE_ENV` | Environment mode (development, production, test) | `development` | No |
| `LOG_LEVEL` | Logging level (error, warn, info, debug, trace) | `info` | No |

### Performance Configuration Variables

| Variable | Description | Default Value | Required |
|----------|-------------|---------------|----------|
| `TIMEOUT_DEFAULT` | Default timeout for CLI operations in milliseconds | `300000` (5 minutes) | No |

## Directory Structure

The OpenStudio MCP Server expects the following directory structure by default:

```
project/
├── data/
│   ├── models/          # OpenStudio model files (.osm)
│   ├── results/         # Simulation results
│   └── weather/         # Weather files (.epw)
├── src/                 # Source code
├── tests/               # Test files
└── dist/                # Built distribution files
```

## Security Considerations

### File System Access

The server implements strict path validation to prevent directory traversal attacks. All file operations are confined to the configured base directories:
- Models are restricted to `MODELS_PATH`
- Results are restricted to `RESULTS_PATH`
- Weather files are restricted to `WEATHER_PATH`

### Command Execution

All command line arguments are properly escaped to prevent command injection attacks. Special characters in arguments are escaped before being passed to the OpenStudio CLI.

### Input Validation

All input parameters undergo validation and sanitization before processing to ensure they conform to expected formats and values.

## Performance Optimization

### Timeouts

CLI operations have configurable timeouts to prevent hanging processes. The default timeout is 5 minutes but can be adjusted through the `TIMEOUT_DEFAULT` environment variable.

### Resource Management

The server ensures proper cleanup of temporary files and resources after operations are completed.

## Logging

The server uses structured logging with different levels of verbosity. Log levels can be configured through the `LOG_LEVEL` environment variable:
- `error`: Only critical errors
- `warn`: Warnings and errors
- `info`: General information, warnings, and errors
- `debug`: Detailed debugging information
- `trace`: Very detailed trace information

## Testing Configuration

When `NODE_ENV` is set to `test`, the server uses different default paths and configurations to avoid interfering with production data.