import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';
import { AppError, NotFoundError } from './errors';
import { ensureDirectory } from './index';

const execPromise = promisify(exec);

// Simple in-memory cache for CLI command results
const commandCache = new Map<string, { stdout: string; stderr: string; code: number | null; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
const MAX_CACHE_SIZE = 100; // Maximum number of cached items

/**
 * Escape command line arguments to prevent command injection
 * @param arg - Argument to escape
 * @returns Escaped argument
 */
export function escapeArgument(arg: unknown): string {
  // Handle null/undefined values
  if (arg === null || arg === undefined) {
    return '';
  }
  
  // Convert to string and escape special characters
  const argStr = String(arg);
  
  // If argument contains spaces or special characters, quote it
  if (/[^\w.,:/=@%-]/.test(argStr)) {
    // Escape quotes, backslashes, and other special characters, then wrap in quotes
    return `"${argStr.replace(/(["\\$`!#&'*;<>?[\]^`{|}])/g, '\\$1')}"`;
  }
  
  return argStr;
}

/**
 * Validate and resolve a path to prevent directory traversal attacks
 * @param inputPath - Path to validate
 * @param basePath - Base directory that paths must be within
 * @returns Resolved safe path
 */
export function validateAndResolvePath(inputPath: string, basePath: string): string {
  // Resolve the input path
  const resolvedPath = path.resolve(inputPath);
  
  // Resolve the base path
  const resolvedBasePath = path.resolve(basePath);
  
  // Check if the resolved path is within the base path
  if (!resolvedPath.startsWith(resolvedBasePath)) {
    throw new AppError(`Path traversal attempt detected: ${inputPath}`, 400, false, 'PATH_TRAVERSAL');
  }
  
  return resolvedPath;
}

/**
 * Execute a command and return the result
 * @param command - Command to execute
 * @param options - Execution options
 * @returns Promise with stdout, stderr, and exit code
 */
export async function executeCommand(
  command: string,
  options: { cwd?: string; timeout?: number; useCache?: boolean } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const useCache = options.useCache !== false; // Default to true
  const cacheKey = useCache ? `${command}:${options.cwd || ''}` : '';
  
  // Check cache if caching is enabled
  if (useCache && commandCache.has(cacheKey)) {
    const cached = commandCache.get(cacheKey)!;
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - cached.timestamp < CACHE_TTL) {
      logger.debug('Returning cached result for command', { command });
      return {
        stdout: cached.stdout,
        stderr: cached.stderr,
        code: cached.code,
      };
    } else {
      // Remove expired cache entry
      commandCache.delete(cacheKey);
    }
  }

  logger.debug('Executing command', { command, options });

  try {
    const timeout = options.timeout || parseInt(process.env.TIMEOUT_DEFAULT || '300000', 10); // Configurable timeout
    const result = await execPromise(command, {
      cwd: options.cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });

    // Cache the result if caching is enabled
    if (useCache) {
      // Clean up expired cache entries and enforce max size
      const now = Date.now();
      for (const [key, value] of commandCache.entries()) {
        if (now - value.timestamp >= CACHE_TTL) {
          commandCache.delete(key);
        }
      }
      
      // If cache is at max size, remove the oldest entry
      if (commandCache.size >= MAX_CACHE_SIZE) {
        const firstKey = commandCache.keys().next().value;
        if (firstKey) {
          commandCache.delete(firstKey);
        }
      }
      
      commandCache.set(cacheKey, {
        stdout: result.stdout,
        stderr: result.stderr,
        code: 0,
        timestamp: now,
      });
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: 0,
    };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    logger.error('Command execution failed', error instanceof Error ? error : undefined, {
      command,
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      code: execError.code || 1,
    });

    // Cache error results as well (but for shorter time)
    if (useCache) {
      const now = Date.now();
      
      // Clean up expired cache entries and enforce max size
      for (const [key, value] of commandCache.entries()) {
        if (now - value.timestamp >= CACHE_TTL) {
          commandCache.delete(key);
        }
      }
      
      // If cache is at max size, remove the oldest entry
      if (commandCache.size >= MAX_CACHE_SIZE) {
        const firstKey = commandCache.keys().next().value;
        if (firstKey) {
          commandCache.delete(firstKey);
        }
      }
      
      commandCache.set(cacheKey, {
        stdout: execError.stdout || '',
        stderr: execError.stderr || (error instanceof Error ? error.message : ''),
        code: execError.code || 1,
        timestamp: now,
      });
    }

    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || (error instanceof Error ? error.message : ''),
      code: execError.code || 1,
    };
  }
}

/**
 * Execute OpenStudio CLI command
 * @param args - Arguments to pass to OpenStudio CLI
 * @param options - Execution options
 * @returns Promise with command result
 */
export async function executeOpenStudioCommand(
  args: string[],
  options: { cwd?: string; timeout?: number; useCache?: boolean } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  // Get OpenStudio path from environment or use default
  const openStudioPath = process.env.OPENSTUDIO_PATH || '/usr/local/openstudio';
  const openStudioBin = path.join(openStudioPath, 'bin', 'openstudio');

  // Ensure working directory exists
  if (options.cwd) {
    await ensureDirectory(options.cwd);
  }

  // Properly escape arguments to prevent command injection
  const escapedArgs = args.map(arg => escapeArgument(arg));
  
  const command = [openStudioBin, ...escapedArgs].join(' ');
  return executeCommand(command, { ...options, useCache: options.useCache });
}

/**
 * Create an OpenStudio model from parameters
 * @param params - Model creation parameters
 * @returns Promise with model creation result
 */
export async function createOpenStudioModel(params: {
  buildingType: string;
  location: string;
  floorArea: number;
  description: string;
  outputPath: string;
}): Promise<{ modelId: string; path: string }> {
  const { buildingType, location, floorArea, description, outputPath } = params;

  // Validate output path to prevent directory traversal
  const modelsPath = process.env.MODELS_PATH || './data/models';
  const safeOutputPath = validateAndResolvePath(outputPath, modelsPath);

  // Ensure output directory exists
  await ensureDirectory(path.dirname(safeOutputPath));

  // Create a simple OpenStudio model using CLI
  // In a real implementation, this would use more sophisticated OpenStudio measures
  const args = [
    'create_model',
    '--building-type',
    buildingType,
    '--location',
    location,
    '--floor-area',
    floorArea.toString(),
    '--description',
    description,
    '--output',
    safeOutputPath,
  ];

  const result = await executeOpenStudioCommand(args, { useCache: false }); // Don't cache model creation

  if (result.code !== 0) {
    throw new AppError(
      `Failed to create OpenStudio model: ${result.stderr}`,
      500,
      true,
      'OPENSTUDIO_ERROR'
    );
  }

  // Extract model ID from output path
  const modelId = path.basename(safeOutputPath, '.osm');

  return {
    modelId,
    path: safeOutputPath,
  };
}

/**
 * Run energy simulation on an OpenStudio model
 * @param modelPath - Path to the OpenStudio model
 * @param weatherPath - Path to weather file (optional)
 * @param outputDir - Output directory for results
 * @returns Promise with simulation result
 */
export async function runEnergySimulation(params: {
  modelPath: string;
  weatherPath?: string;
  outputDir: string;
}): Promise<{ jobId: string; status: string; outputPath: string }> {
  const { modelPath, weatherPath, outputDir } = params;

  // Validate paths to prevent directory traversal
  const modelsPath = process.env.MODELS_PATH || './data/models';
  const resultsPath = process.env.RESULTS_PATH || './data/results';
  const safeModelPath = validateAndResolvePath(modelPath, modelsPath);
  const safeOutputDir = validateAndResolvePath(outputDir, resultsPath);

  // Ensure output directory exists
  await ensureDirectory(safeOutputDir);

  // Check if model file exists
  try {
    await fs.access(safeModelPath);
  } catch (error) {
    throw new NotFoundError('Model file', safeModelPath);
  }

  // Build command arguments
  const args = ['run_simulation', safeModelPath];

  if (weatherPath) {
    // Validate weather path if provided
    const weatherPathBase = process.env.WEATHER_PATH || './data/weather';
    const safeWeatherPath = validateAndResolvePath(weatherPath, weatherPathBase);
    args.push('--weather-file', safeWeatherPath);
  }

  args.push('--output-directory', safeOutputDir);

  const result = await executeOpenStudioCommand(args, { cwd: safeOutputDir, useCache: false }); // Don't cache simulations

  if (result.code !== 0) {
    throw new AppError(`Energy simulation failed: ${result.stderr}`, 500, true, 'SIMULATION_ERROR');
  }

  // Extract job ID from output directory
  const jobId = path.basename(safeOutputDir);

  return {
    jobId,
    status: 'completed',
    outputPath: safeOutputDir,
  };
}

/**
 * Validate OpenStudio model against ASHRAE standards
 * @param modelPath - Path to the OpenStudio model
 * @param standard - ASHRAE standard to validate against
 * @returns Promise with validation result
 */
export async function validateModelASHRAE(params: {
  modelPath: string;
  standard: string;
}): Promise<{ compliant: boolean; report: string }> {
  const { modelPath, standard } = params;

  // Validate model path to prevent directory traversal
  const modelsPath = process.env.MODELS_PATH || './data/models';
  const safeModelPath = validateAndResolvePath(modelPath, modelsPath);

  // Check if model file exists
  try {
    await fs.access(safeModelPath);
  } catch (error) {
    throw new NotFoundError('Model file', safeModelPath);
  }

  // Run validation command
  const args = ['validate_model', '--model', safeModelPath, '--standard', standard, '--format', 'json'];

  const result = await executeOpenStudioCommand(args, { useCache: true }); // Cache validation results

  if (result.code !== 0) {
    throw new AppError(`Model validation failed: ${result.stderr}`, 500, true, 'VALIDATION_ERROR');
  }

  // Parse validation output (simplified)
  const compliant = !result.stderr.includes('ERROR') && !result.stderr.includes('FAIL');
  const report = result.stdout || 'Validation completed successfully';

  return {
    compliant,
    report,
  };
}

/**
 * Export OpenStudio model to Radiance format
 * @param modelPath - Path to the OpenStudio model
 * @param outputPath - Output path for Radiance files
 * @param options - Export options
 * @returns Promise with export result
 */
export async function exportToRadiance(params: {
  modelPath: string;
  outputPath: string;
  includeWindows?: boolean;
  materialProperties?: boolean;
}): Promise<{ exported: boolean; path: string }> {
  const { modelPath, outputPath, includeWindows = true, materialProperties = true } = params;

  // Validate paths to prevent directory traversal
  const modelsPath = process.env.MODELS_PATH || './data/models';
  const resultsPath = process.env.RESULTS_PATH || './data/results';
  const safeModelPath = validateAndResolvePath(modelPath, modelsPath);
  const safeOutputPath = validateAndResolvePath(outputPath, resultsPath);

  // Check if model file exists
  try {
    await fs.access(safeModelPath);
  } catch (error) {
    throw new NotFoundError('Model file', safeModelPath);
  }

  // Ensure output directory exists
  await ensureDirectory(path.dirname(safeOutputPath));

  // Build export command
  const args = ['export_radiance', safeModelPath, '--output', safeOutputPath];

  if (includeWindows) {
    args.push('--include-windows');
  }

  if (materialProperties) {
    args.push('--include-materials');
  }

  const result = await executeOpenStudioCommand(args, { useCache: false }); // Don't cache exports

  if (result.code !== 0) {
    throw new AppError(`Radiance export failed: ${result.stderr}`, 500, true, 'EXPORT_ERROR');
  }

  return {
    exported: true,
    path: safeOutputPath,
  };
}

/**
 * Get simulation results
 * @param jobId - Job ID for the simulation
 * @param format - Output format
 * @param resultsDir - Directory containing results
 * @returns Promise with results
 */
export async function getSimulationResults(params: {
  jobId: string;
  format: string;
  resultsDir: string;
}): Promise<{ content: string; format: string }> {
  const { jobId: _jobId, format, resultsDir } = params;

  // Validate results directory path to prevent directory traversal
  const resultsPath = process.env.RESULTS_PATH || './data/results';
  const safeResultsDir = validateAndResolvePath(resultsDir, resultsPath);

  // Check if results directory exists
  try {
    await fs.access(safeResultsDir);
  } catch (error) {
    throw new NotFoundError('Results directory', safeResultsDir);
  }

  // Determine result file based on format
  let resultFile: string;
  switch (format.toLowerCase()) {
    case 'json':
      resultFile = path.join(safeResultsDir, 'results.json');
      break;
    case 'csv':
      resultFile = path.join(safeResultsDir, 'results.csv');
      break;
    case 'html':
      resultFile = path.join(safeResultsDir, 'results.html');
      break;
    default:
      resultFile = path.join(safeResultsDir, 'results.json');
  }

  // Check if result file exists
  try {
    await fs.access(resultFile);
  } catch (error) {
    throw new NotFoundError('Result file', resultFile);
  }

  // Read the result file
  const content = await fs.readFile(resultFile, 'utf-8');

  return {
    content,
    format,
  };
}
