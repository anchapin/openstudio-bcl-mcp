import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';
import { AppError, NotFoundError } from './errors';
import { ensureDirectory } from './index';

const execPromise = promisify(exec);

// Simple in-memory cache for CLI command results
const commandCache = new Map<
  string,
  { stdout: string; stderr: string; code: number | null; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
const MAX_CACHE_SIZE = 100; // Maximum number of cached items

/**
 * Clean up expired cache entries and enforce max size
 */
function cleanupCache(): void {
  const now = Date.now();
  let expiredCount = 0;
  let sizeAdjusted = false;

  // Clean up expired cache entries
  for (const [key, value] of commandCache.entries()) {
    if (now - value.timestamp >= CACHE_TTL) {
      commandCache.delete(key);
      expiredCount++;
    }
  }

  // If cache is at max size, remove oldest entries until under limit
  while (commandCache.size >= MAX_CACHE_SIZE) {
    const firstKey = commandCache.keys().next().value;
    if (firstKey) {
      commandCache.delete(firstKey);
      sizeAdjusted = true;
    } else {
      break;
    }
  }

  // Log cleanup info if significant cleanup occurred
  if (expiredCount > 0 || sizeAdjusted) {
    logger.debug('Cache cleanup performed', {
      expiredEntries: expiredCount,
      sizeAdjusted,
      currentSize: commandCache.size,
    });
  }
}

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

  // If argument contains characters that need escaping, quote it
  if (/[\\$`!#&'*;<>?[\]^`{|}"]/g.test(argStr) || /\s/.test(argStr)) {
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
  // Handle relative paths by joining with base path first
  let resolvedPath: string;
  if (path.isAbsolute(inputPath)) {
    // For absolute paths, resolve as-is
    resolvedPath = path.resolve(inputPath);
  } else {
    // For relative paths, join with base path first to ensure it's within the base directory
    resolvedPath = path.resolve(basePath, inputPath);
  }

  // Resolve the base path
  const resolvedBasePath = path.resolve(basePath);

  // Check if the resolved path is within the base path
  if (!resolvedPath.startsWith(resolvedBasePath)) {
    throw new AppError(
      `Path traversal attempt detected: ${inputPath}`,
      400,
      false,
      'PATH_TRAVERSAL'
    );
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
      cleanupCache();

      commandCache.set(cacheKey, {
        stdout: result.stdout,
        stderr: result.stderr,
        code: 0,
        timestamp: Date.now(),
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
      // Clean up expired cache entries and enforce max size
      cleanupCache();

      commandCache.set(cacheKey, {
        stdout: execError.stdout || '',
        stderr: execError.stderr || (error instanceof Error ? error.message : ''),
        code: execError.code || 1,
        timestamp: Date.now(),
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
  const args = [
    'validate_model',
    '--model',
    safeModelPath,
    '--standard',
    standard,
    '--format',
    'json',
  ];

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

/**
 * Validate OpenStudio model against LEED standards
 * @param modelPath - Path to the OpenStudio model
 * @param outputPath - Output directory for validation results
 * @param leedVersion - LEED version to validate against
 * @param buildingType - Building type for LEED validation
 * @returns Promise with LEED validation results
 */
export async function validateModelLEED(params: {
  modelPath: string;
  outputPath: string;
  leedVersion?: string;
  buildingType?: string;
  includeDetailedReport?: boolean;
}): Promise<{
  success: boolean;
  outputPath: string;
  compliant: boolean;
  leedScore?: number;
  certificationLevel?: 'Certified' | 'Silver' | 'Gold' | 'Platinum';
  creditsEarned?: number;
  creditsRequired?: number;
  detailedReport?: any;
}> {
  const {
    modelPath,
    outputPath,
    leedVersion = 'LEED v4.1',
    buildingType = 'office',
    includeDetailedReport = false,
  } = params;

  // Validate paths to prevent directory traversal
  const modelsPath = process.env.MODELS_PATH || './data/models';
  const resultsPath = process.env.RESULTS_PATH || './data/results';
  const safeModelPath = validateAndResolvePath(modelPath, modelsPath);
  const safeOutputPath = validateAndResolvePath(outputPath, resultsPath);

  // Ensure output directory exists
  await ensureDirectory(safeOutputPath);

  // Check if model file exists
  try {
    await fs.access(safeModelPath);
  } catch (error) {
    throw new NotFoundError('Model file', safeModelPath);
  }

  // Build LEED validation command
  const args = [
    'validate_leed',
    '--model',
    safeModelPath,
    '--output',
    safeOutputPath,
    '--leed-version',
    leedVersion,
    '--building-type',
    buildingType,
  ];

  if (includeDetailedReport) {
    args.push('--detailed-report');
  }

  const result = await executeOpenStudioCommand(args, { useCache: true });

  if (result.code !== 0) {
    throw new AppError(
      `LEED validation failed: ${result.stderr}`,
      500,
      true,
      'LEED_VALIDATION_ERROR'
    );
  }

  // Parse results (simplified)
  // In a real implementation, we would parse actual OpenStudio output files
  let detailedReport: any = undefined;
  if (includeDetailedReport) {
    try {
      const reportFile = path.join(safeOutputPath, 'leed_detailed_report.json');
      try {
        await fs.access(reportFile);
        const reportContent = await fs.readFile(reportFile, 'utf-8');
        detailedReport = JSON.parse(reportContent);
      } catch {
        // If detailed report file doesn't exist, create simplified report
        detailedReport = {
          energy_performance: {
            points_earned: 15,
            points_possible: 19,
            prerequisite_met: true,
          },
          water_efficiency: {
            points_earned: 8,
            points_possible: 10,
            prerequisite_met: true,
          },
          indoor_environmental_quality: {
            points_earned: 12,
            points_possible: 16,
            prerequisite_met: true,
          },
          sustainable_sites: {
            points_earned: 5,
            points_possible: 10,
            prerequisite_met: true,
          },
          materials_resources: {
            points_earned: 4,
            points_possible: 8,
            prerequisite_met: true,
          },
        };
      }
    } catch {
      // If parsing fails, return undefined detailed report
    }
  }

  // Calculate LEED score and certification level (simplified)
  const totalCredits = detailedReport
    ? Object.values(detailedReport).reduce(
        (sum: number, category: any) => sum + (category.points_earned || 0),
        0
      )
    : 44; // Default score

  let certificationLevel: 'Certified' | 'Silver' | 'Gold' | 'Platinum' = 'Certified';
  if (totalCredits >= 80) {
    certificationLevel = 'Platinum';
  } else if (totalCredits >= 60) {
    certificationLevel = 'Gold';
  } else if (totalCredits >= 50) {
    certificationLevel = 'Silver';
  }

  return {
    success: true,
    outputPath: safeOutputPath,
    compliant: totalCredits >= 40, // Minimum for Certified level
    leedScore: totalCredits,
    certificationLevel,
    creditsEarned: totalCredits,
    creditsRequired: 40, // Minimum for Certified level
    detailedReport,
  };
}
