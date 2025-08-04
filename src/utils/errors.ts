/**
 * Custom error classes for the OpenStudio MCP server
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string | undefined;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string
  ) {
    super(message);

    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name;

    // This clips the constructor invocation from the stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, true, 'VALIDATION_ERROR');

    if (details) {
      this.message = `${message}: ${JSON.stringify(details)}`;
    }
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, 404, true, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, true, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, true, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, true, 'FORBIDDEN');
  }
}

export class OpenStudioError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(`OpenStudio CLI error: ${message}`, 500, true, 'OPENSTUDIO_ERROR');

    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
  }
}

export class MCPProtocolError extends AppError {
  public readonly mcpErrorCode: number;

  constructor(message: string, mcpErrorCode: number = -32603) {
    super(message, 400, true, 'MCP_PROTOCOL_ERROR');
    this.mcpErrorCode = mcpErrorCode;
  }
}

export class SimulationError extends AppError {
  public readonly jobId: string | undefined;

  constructor(message: string, jobId?: string) {
    super(`Simulation failed: ${message}`, 500, true, 'SIMULATION_ERROR');
    this.jobId = jobId;
  }
}

export class FileSystemError extends AppError {
  public readonly filePath: string | undefined;

  constructor(message: string, filePath?: string) {
    super(`File system error: ${message}`, 500, true, 'FILESYSTEM_ERROR');
    this.filePath = filePath;
  }
}

/**
 * Error handler utility functions
 */

export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};

export const getErrorStatusCode = (error: Error): number => {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  return 500;
};

export const getErrorCode = (error: Error): string => {
  if (error instanceof AppError && error.code) {
    return error.code;
  }
  return 'INTERNAL_ERROR';
};

export const formatErrorResponse = (
  error: Error
): {
  message: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
} => {
  const statusCode = getErrorStatusCode(error);
  const code = getErrorCode(error);

  const response = {
    message: error.message,
    code,
    statusCode,
  };

  // Add additional details for specific error types
  if (error instanceof ValidationError) {
    return {
      ...response,
      details: { validation: true },
    };
  }

  if (error instanceof SimulationError && error.jobId) {
    return {
      ...response,
      details: { jobId: error.jobId },
    };
  }

  if (error instanceof FileSystemError && error.filePath) {
    return {
      ...response,
      details: { filePath: error.filePath },
    };
  }

  if (error instanceof MCPProtocolError) {
    return {
      ...response,
      details: { mcpErrorCode: error.mcpErrorCode },
    };
  }

  return response;
};
