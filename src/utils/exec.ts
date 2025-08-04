import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';
import { AppError, NotFoundError, FileSystemError } from './errors';
import { ensureDirectory } from './index';

const execPromise = promisify(exec);

/**
 * Execute a command and return the result
 * @param command - Command to execute
 * @param options - Execution options
 * @returns Promise with stdout, stderr, and exit code
 */
export async function executeCommand(
  command: string,
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  logger.debug('Executing command', { command, options });
  
  try {
    const timeout = options.timeout || 300000; // 5 minutes default timeout
    const result = await execPromise(command, {
      cwd: options.cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });
    
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: 0,
    };
  } catch (error: any) {
    logger.error('Command execution failed', error, {
      command,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      code: error.code || 1,
    });
    
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      code: error.code || 1,
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
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  // Get OpenStudio path from environment or use default
  const openStudioPath = process.env.OPENSTUDIO_PATH || '/usr/local/openstudio';
  const openStudioBin = path.join(openStudioPath, 'bin', 'openstudio');
  
  // Ensure working directory exists
  if (options.cwd) {
    await ensureDirectory(options.cwd);
  }
  
  const command = `${openStudioBin} ${args.join(' ')}`;
  return executeCommand(command, options);
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
  
  // Ensure output directory exists
  await ensureDirectory(path.dirname(outputPath));
  
  // Create a simple OpenStudio model using CLI
  // In a real implementation, this would use more sophisticated OpenStudio measures
  const args = [
    'create_model',
    '--building-type', buildingType,
    '--location', location,
    '--floor-area', floorArea.toString(),
    '--description', `"${description}"`,
    '--output', outputPath
  ];
  
  const result = await executeOpenStudioCommand(args);
  
  if (result.code !== 0) {
    throw new AppError(
      `Failed to create OpenStudio model: ${result.stderr}`,
      500,
      true,
      'OPENSTUDIO_ERROR'
    );
  }
  
  // Extract model ID from output path
  const modelId = path.basename(outputPath, '.osm');
  
  return {
    modelId,
    path: outputPath,
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
  
  // Ensure output directory exists
  await ensureDirectory(outputDir);
  
  // Check if model file exists
  try {
    await fs.access(modelPath);
  } catch (error) {
    throw new NotFoundError('Model file', modelPath);
  }
  
  // Build command arguments
  const args = ['run_simulation', modelPath];
  
  if (weatherPath) {
    args.push('--weather-file', weatherPath);
  }
  
  args.push('--output-directory', outputDir);
  
  const result = await executeOpenStudioCommand(args, { cwd: outputDir });
  
  if (result.code !== 0) {
    throw new AppError(
      `Energy simulation failed: ${result.stderr}`,
      500,
      true,
      'SIMULATION_ERROR'
    );
  }
  
  // Extract job ID from output directory
  const jobId = path.basename(outputDir);
  
  return {
    jobId,
    status: 'completed',
    outputPath: outputDir,
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
  
  // Check if model file exists
  try {
    await fs.access(modelPath);
  } catch (error) {
    throw new NotFoundError('Model file', modelPath);
  }
  
  // Run validation command
  const args = [
    'validate_model',
    '--model', modelPath,
    '--standard', standard,
    '--format', 'json'
  ];
  
  const result = await executeOpenStudioCommand(args);
  
  if (result.code !== 0) {
    throw new AppError(
      `Model validation failed: ${result.stderr}`,
      500,
      true,
      'VALIDATION_ERROR'
    );
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
  
  // Check if model file exists
  try {
    await fs.access(modelPath);
  } catch (error) {
    throw new NotFoundError('Model file', modelPath);
  }
  
  // Ensure output directory exists
  await ensureDirectory(path.dirname(outputPath));
  
  // Build export command
  const args = ['export_radiance', modelPath, '--output', outputPath];
  
  if (includeWindows) {
    args.push('--include-windows');
  }
  
  if (materialProperties) {
    args.push('--include-materials');
  }
  
  const result = await executeOpenStudioCommand(args);
  
  if (result.code !== 0) {
    throw new AppError(
      `Radiance export failed: ${result.stderr}`,
      500,
      true,
      'EXPORT_ERROR'
    );
  }
  
  return {
    exported: true,
    path: outputPath,
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
  const { jobId, format, resultsDir } = params;
  
  // Check if results directory exists
  try {
    await fs.access(resultsDir);
  } catch (error) {
    throw new NotFoundError('Results directory', resultsDir);
  }
  
  // Determine result file based on format
  let resultFile: string;
  switch (format.toLowerCase()) {
    case 'json':
      resultFile = path.join(resultsDir, 'results.json');
      break;
    case 'csv':
      resultFile = path.join(resultsDir, 'results.csv');
      break;
    case 'html':
      resultFile = path.join(resultsDir, 'results.html');
      break;
    default:
      resultFile = path.join(resultsDir, 'results.json');
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