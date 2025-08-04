import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils';
import { ValidationError, NotFoundError } from '../utils/errors';
import { safeValidate, runSimulationRequestSchema, paginationSchema } from '../utils/validation';
import type { SimulationJob, RunSimulationRequest, PaginatedResponse } from '../types';

const router = Router();

// In-memory storage for demo purposes (replace with actual database)
const simulationJobs = new Map<string, SimulationJob>();

/**
 * Get all simulation jobs
 * GET /api/v1/simulations
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    logger.info('Simulation jobs list requested', { requestId: req.id, query: req.query });

    // Validate pagination parameters
    const paginationData = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as string) || 'desc', // Default to newest first
    };
    
    const paginationValidation = safeValidate(paginationSchema, paginationData);

    if (!paginationValidation.success) {
      throw new ValidationError('Invalid pagination parameters', paginationValidation.error.flatten());
    }

    const { page, limit, sortBy, sortOrder } = paginationValidation.data;

    // Ensure page and limit are not undefined (validation should guarantee this)
    const safePage = page ?? 1;
    const safeLimit = limit ?? 20;

    // Filter by status if provided
    const statusFilter = req.query.status as string;
    const modelIdFilter = req.query.modelId as string;

    let jobsList = Array.from(simulationJobs.values());

    // Apply filters
    if (statusFilter) {
      jobsList = jobsList.filter(job => job.status === statusFilter);
    }
    if (modelIdFilter) {
      jobsList = jobsList.filter(job => job.modelId === modelIdFilter);
    }

    // Apply sorting
    if (sortBy) {
      jobsList.sort((a, b) => {
        const aValue = (a as any)[sortBy];
        const bValue = (b as any)[sortBy];
        
        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort by creation time (newest first)
      jobsList.sort((a, b) => {
        const aTime = a.startedAt?.getTime() || 0;
        const bTime = b.startedAt?.getTime() || 0;
        return sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
      });
    }

    // Apply pagination
    const total = jobsList.length;
    const totalPages = Math.ceil(total / safeLimit);
    const startIndex = (safePage - 1) * safeLimit;
    const paginatedJobs = jobsList.slice(startIndex, startIndex + safeLimit);

    const response: PaginatedResponse<SimulationJob> = {
      data: paginatedJobs,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving simulation jobs', error instanceof Error ? error : undefined, {
      requestId: req.id,
    });
    throw error;
  }
});

/**
 * Get a specific simulation job
 * GET /api/v1/simulations/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw new ValidationError('Simulation job ID is required');
    }
    
    logger.info('Simulation job details requested', { requestId: req.id, jobId: id });

    const job = simulationJobs.get(id);
    if (!job) {
      throw new NotFoundError('Simulation job', id);
    }

    res.json(job);
  } catch (error) {
    logger.error('Error retrieving simulation job', error instanceof Error ? error : undefined, {
      requestId: req.id,
      jobId: req.params.id,
    });
    throw error;
  }
});

/**
 * Create and start a new simulation job
 * POST /api/v1/simulations
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    logger.info('Simulation job creation requested', { requestId: req.id, body: req.body });

    // Validate request body
    const validation = safeValidate(runSimulationRequestSchema, req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid simulation request', validation.error.flatten());
    }

    const simulationRequest = validation.data;

    // Create new simulation job
    const jobId = uuidv4();
    const now = new Date();
    
    const newJob: SimulationJob = {
      id: jobId,
      modelId: simulationRequest.modelId,
      status: 'pending',
      progress: 0,
      startedAt: now,
    };

    // Store job (in real implementation, this would be in a database)
    simulationJobs.set(jobId, newJob);

    // Start the simulation asynchronously (mock implementation)
    setTimeout(() => {
      void runSimulation(jobId, simulationRequest);
    }, 100);

    logger.info('Simulation job created successfully', {
      requestId: req.id,
      jobId,
      modelId: simulationRequest.modelId,
    });

    res.status(201).json(newJob);
  } catch (error) {
    logger.error('Error creating simulation job', error instanceof Error ? error : undefined, {
      requestId: req.id,
    });
    throw error;
  }
});

/**
 * Cancel a running simulation job
 * POST /api/v1/simulations/:id/cancel
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw new ValidationError('Simulation job ID is required');
    }
    
    logger.info('Simulation job cancellation requested', { requestId: req.id, jobId: id });

    const job = simulationJobs.get(id);
    if (!job) {
      throw new NotFoundError('Simulation job', id);
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      throw new ValidationError(`Cannot cancel job with status: ${job.status}`);
    }

    // Update job status
    const updatedJob: SimulationJob = {
      ...job,
      status: 'cancelled',
      completedAt: new Date(),
    };

    simulationJobs.set(id, updatedJob);

    logger.info('Simulation job cancelled successfully', {
      requestId: req.id,
      jobId: id,
    });

    res.json(updatedJob);
  } catch (error) {
    logger.error('Error cancelling simulation job', error instanceof Error ? error : undefined, {
      requestId: req.id,
      jobId: req.params.id,
    });
    throw error;
  }
});

/**
 * Get simulation job results
 * GET /api/v1/simulations/:id/results
 */
router.get('/:id/results', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const format = req.query.format as string || 'json';
    
    if (!id) {
      throw new ValidationError('Simulation job ID is required');
    }
    
    logger.info('Simulation results requested', { requestId: req.id, jobId: id, format });

    const job = simulationJobs.get(id);
    if (!job) {
      throw new NotFoundError('Simulation job', id);
    }

    if (job.status !== 'completed') {
      throw new ValidationError(`Simulation job is not completed. Current status: ${job.status}`);
    }

    if (!job.results) {
      throw new ValidationError('No results available for this simulation job');
    }

    // Format results based on requested format
    switch (format) {
      case 'csv':
        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', `attachment; filename="simulation_${id}_results.csv"`);
        res.send(convertResultsToCSV(job.results));
        break;
      case 'html':
        res.set('Content-Type', 'text/html');
        res.send(convertResultsToHTML(job.results));
        break;
      case 'json':
      default:
        res.json({
          jobId: id,
          status: job.status,
          results: job.results,
          timestamp: new Date().toISOString(),
        });
        break;
    }
  } catch (error) {
    logger.error('Error retrieving simulation results', error instanceof Error ? error : undefined, {
      requestId: req.id,
      jobId: req.params.id,
    });
    throw error;
  }
});

/**
 * Get simulation job status
 * GET /api/v1/simulations/:id/status
 */
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw new ValidationError('Simulation job ID is required');
    }
    
    logger.info('Simulation status requested', { requestId: req.id, jobId: id });

    const job = simulationJobs.get(id);
    if (!job) {
      throw new NotFoundError('Simulation job', id);
    }

    res.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
    });
  } catch (error) {
    logger.error('Error retrieving simulation status', error instanceof Error ? error : undefined, {
      requestId: req.id,
      jobId: req.params.id,
    });
    throw error;
  }
});

/**
 * Delete a simulation job and its results
 * DELETE /api/v1/simulations/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      throw new ValidationError('Simulation job ID is required');
    }
    
    logger.info('Simulation job deletion requested', { requestId: req.id, jobId: id });

    const job = simulationJobs.get(id);
    if (!job) {
      throw new NotFoundError('Simulation job', id);
    }

    // Delete job and results
    simulationJobs.delete(id);

    logger.info('Simulation job deleted successfully', {
      requestId: req.id,
      jobId: id,
      modelId: job.modelId,
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting simulation job', error instanceof Error ? error : undefined, {
      requestId: req.id,
      jobId: req.params.id,
    });
    throw error;
  }
});

/**
 * Mock simulation runner (replace with actual OpenStudio integration)
 */
async function runSimulation(jobId: string, request: RunSimulationRequest): Promise<void> {
  const job = simulationJobs.get(jobId);
  if (!job) return;

  try {
    // Update status to running
    simulationJobs.set(jobId, { ...job, status: 'running', progress: 0 });

    // Simulate progress updates
    for (let progress = 10; progress <= 90; progress += 20) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      const currentJob = simulationJobs.get(jobId);
      if (currentJob?.status === 'cancelled') return;
      
      simulationJobs.set(jobId, { ...job, status: 'running', progress });
    }

    // Complete simulation with mock results
    const completedJob: SimulationJob = {
      ...job,
      status: 'completed',
      progress: 100,
      completedAt: new Date(),
      results: {
        energyUse: {
          totalEnergyUse: 125.5,
          heatingEnergyUse: 45.2,
          coolingEnergyUse: 38.7,
          lightingEnergyUse: 24.1,
          equipmentEnergyUse: 17.5,
          monthlyData: Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            heating: 45.2 / 12,
            cooling: 38.7 / 12,
            lighting: 24.1 / 12,
            equipment: 17.5 / 12,
            total: 125.5 / 12,
          })),
        },
        comfort: {
          unmetHeatingHours: 12,
          unmetCoolingHours: 8,
          avgTemperature: 22.5,
          avgHumidity: 45.0,
        },
        outputFiles: [
          {
            name: 'eplusout.csv',
            path: `/results/${jobId}/eplusout.csv`,
            type: 'csv',
            size: 1024000,
          },
          {
            name: 'eplustbl.htm',
            path: `/results/${jobId}/eplustbl.htm`,
            type: 'html',
            size: 512000,
          },
        ],
      },
    };

    simulationJobs.set(jobId, completedJob);
    
    logger.info('Simulation completed successfully', {
      jobId,
      modelId: request.modelId,
      duration: Date.now() - (job.startedAt?.getTime() || 0),
    });
  } catch (error) {
    // Handle simulation failure
    const failedJob: SimulationJob = {
      ...job,
      status: 'failed',
      completedAt: new Date(),
      error: error instanceof Error ? error.message : 'Unknown simulation error',
    };

    simulationJobs.set(jobId, failedJob);
    
    logger.error('Simulation failed', error instanceof Error ? error : undefined, {
      jobId,
      modelId: request.modelId,
    });
  }
}

/**
 * Convert simulation results to CSV format
 */
function convertResultsToCSV(results: any): string {
  const lines = [];
  lines.push('Metric,Value,Unit');
  lines.push(`Total Energy Use,${results.energyUse.totalEnergyUse},kWh/m²/year`);
  lines.push(`Heating Energy Use,${results.energyUse.heatingEnergyUse},kWh/m²/year`);
  lines.push(`Cooling Energy Use,${results.energyUse.coolingEnergyUse},kWh/m²/year`);
  lines.push(`Lighting Energy Use,${results.energyUse.lightingEnergyUse},kWh/m²/year`);
  lines.push(`Equipment Energy Use,${results.energyUse.equipmentEnergyUse},kWh/m²/year`);
  lines.push(`Unmet Heating Hours,${results.comfort.unmetHeatingHours},hours`);
  lines.push(`Unmet Cooling Hours,${results.comfort.unmetCoolingHours},hours`);
  return lines.join('\n');
}

/**
 * Convert simulation results to HTML format
 */
function convertResultsToHTML(results: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Simulation Results</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <h1>Energy Simulation Results</h1>
      <h2>Energy Use Summary</h2>
      <table>
        <tr><th>Metric</th><th>Value</th><th>Unit</th></tr>
        <tr><td>Total Energy Use</td><td>${results.energyUse.totalEnergyUse}</td><td>kWh/m²/year</td></tr>
        <tr><td>Heating Energy Use</td><td>${results.energyUse.heatingEnergyUse}</td><td>kWh/m²/year</td></tr>
        <tr><td>Cooling Energy Use</td><td>${results.energyUse.coolingEnergyUse}</td><td>kWh/m²/year</td></tr>
        <tr><td>Lighting Energy Use</td><td>${results.energyUse.lightingEnergyUse}</td><td>kWh/m²/year</td></tr>
        <tr><td>Equipment Energy Use</td><td>${results.energyUse.equipmentEnergyUse}</td><td>kWh/m²/year</td></tr>
      </table>
      <h2>Comfort Analysis</h2>
      <table>
        <tr><th>Metric</th><th>Value</th><th>Unit</th></tr>
        <tr><td>Unmet Heating Hours</td><td>${results.comfort.unmetHeatingHours}</td><td>hours</td></tr>
        <tr><td>Unmet Cooling Hours</td><td>${results.comfort.unmetCoolingHours}</td><td>hours</td></tr>
        <tr><td>Average Temperature</td><td>${results.comfort.avgTemperature}</td><td>°C</td></tr>
        <tr><td>Average Humidity</td><td>${results.comfort.avgHumidity}</td><td>%</td></tr>
      </table>
    </body>
    </html>
  `;
}

export { router as simulationsRouter };
