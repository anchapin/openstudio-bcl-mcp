import { z } from 'zod';

/**
 * Common validation schemas for the OpenStudio MCP server
 */

// UUID validation
export const uuidSchema = z.string().uuid();

// Pagination validation
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Model format validation
export const modelFormatSchema = z.enum(['osm', 'idf', 'gbxml']);

// Job status validation
export const jobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);

// Create model request validation
export const createModelRequestSchema = z.object({
  name: z.string().min(1).max(255),
  buildingType: z.string().min(1).max(100),
  climateZone: z.string().min(1).max(20),
  location: z.string().min(1).max(255),
  floorArea: z.number().positive(),
  description: z.string().max(1000).optional(),
});

// Simulation request validation
export const runSimulationRequestSchema = z.object({
  modelId: uuidSchema,
  weatherFile: z.string().optional(),
  measures: z
    .array(
      z.object({
        name: z.string().min(1),
        arguments: z.record(z.unknown()),
      })
    )
    .optional(),
  outputVariables: z.array(z.string()).optional(),
});

// MCP request validation
export const mcpRequestSchema = z.object({
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

// File upload validation
export const fileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimetype: z.string().min(1),
  size: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024), // 50MB max
});

/**
 * Validation helper functions
 */

// Safe validation that returns Result type
export const safeValidate = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } => {
  const result = schema.safeParse(data);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
};

// Validation middleware factory
export const validateSchema = <T>(schema: z.ZodSchema<T>) => {
  return (data: unknown): T => {
    return schema.parse(data);
  };
};

// Query parameter parser
export const parseQueryParams = (
  query: Record<string, unknown>
): z.infer<typeof paginationSchema> => {
  // Convert string numbers to actual numbers
  const parsed = {
    ...query,
    page: query.page ? parseInt(query.page as string, 10) : undefined,
    limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
  };

  return paginationSchema.parse(parsed);
};

// Environment variable validation helper
export const validateEnvVar = (name: string, schema: z.ZodSchema): unknown => {
  const value = process.env[name];

  try {
    return schema.parse(value);
  } catch (error) {
    throw new Error(
      `Invalid environment variable ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
