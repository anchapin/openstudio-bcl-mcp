import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils';
import { ValidationError, NotFoundError } from '../utils/errors';
import { safeValidate, createModelRequestSchema, paginationSchema } from '../utils/validation';
import type { EnergyModel, PaginatedResponse } from '../types';

const router = Router();

// In-memory storage for demo purposes (replace with actual database)
const models = new Map<string, EnergyModel>();

/**
 * Get all energy models
 * GET /api/v1/models
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    logger.info('Models list requested', { requestId: req.id, query: req.query });

    // Validate pagination parameters
    const paginationData = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as string) || 'asc',
    };

    const paginationValidation = safeValidate(paginationSchema, paginationData);

    if (!paginationValidation.success) {
      throw new ValidationError(
        'Invalid pagination parameters',
        paginationValidation.error.flatten()
      );
    }

    const { page, limit, sortBy, sortOrder } = paginationValidation.data;

    // Ensure page and limit are not undefined (validation should guarantee this)
    const safePage = page ?? 1;
    const safeLimit = limit ?? 20;

    // Get all models
    const modelsList = Array.from(models.values());

    // Apply sorting
    if (sortBy) {
      modelsList.sort((a, b) => {
        const aValue = a[sortBy as keyof typeof a];
        const bValue = b[sortBy as keyof typeof b];

        if (aValue !== undefined && bValue !== undefined) {
          if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    // Apply pagination
    const total = modelsList.length;
    const totalPages = Math.ceil(total / safeLimit);
    const startIndex = (safePage - 1) * safeLimit;
    const paginatedModels = modelsList.slice(startIndex, startIndex + safeLimit);

    const response: PaginatedResponse<EnergyModel> = {
      data: paginatedModels,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving models', error instanceof Error ? error : undefined, {
      requestId: req.id,
    });
    throw error;
  }
});

/**
 * Get a specific energy model
 * GET /api/v1/models/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Model ID is required');
    }

    logger.info('Model details requested', { requestId: req.id, modelId: id });

    const model = models.get(id);
    if (!model) {
      throw new NotFoundError('Energy model', id);
    }

    res.json(model);
  } catch (error) {
    logger.error('Error retrieving model', error instanceof Error ? error : undefined, {
      requestId: req.id,
      modelId: req.params.id,
    });
    throw error;
  }
});

/**
 * Create a new energy model
 * POST /api/v1/models
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    logger.info('Model creation requested', { requestId: req.id, body: req.body });

    // Validate request body
    const validation = safeValidate(createModelRequestSchema, req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid model creation request', validation.error.flatten());
    }

    const modelRequest = validation.data;

    // Create new model
    const modelId = uuidv4();
    const now = new Date();

    const newModel: EnergyModel = {
      id: modelId,
      name: modelRequest.name,
      format: 'osm' as const, // Default format
      path: `/models/${modelId}.osm`,
      metadata: {
        buildingType: modelRequest.buildingType,
        climateZone: modelRequest.climateZone,
        location: modelRequest.location,
        floorArea: modelRequest.floorArea,
        version: '3.7.0',
        tags: [],
      },
      createdAt: now,
      updatedAt: now,
    };

    // Store model (in real implementation, this would be in a database)
    models.set(modelId, newModel);

    logger.info('Model created successfully', {
      requestId: req.id,
      modelId,
      name: newModel.name,
    });

    res.status(201).json(newModel);
  } catch (error) {
    logger.error('Error creating model', error instanceof Error ? error : undefined, {
      requestId: req.id,
    });
    throw error;
  }
});

/**
 * Update an existing energy model
 * PUT /api/v1/models/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Model ID is required');
    }

    logger.info('Model update requested', { requestId: req.id, modelId: id, body: req.body });

    const existingModel = models.get(id);
    if (!existingModel) {
      throw new NotFoundError('Energy model', id);
    }

    // Validate update request (allow partial updates)
    const updateSchema = createModelRequestSchema.partial();
    const validation = safeValidate(updateSchema, req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid model update request', validation.error.flatten());
    }

    const updates = validation.data;

    // Update model
    const updatedModel: EnergyModel = {
      ...existingModel,
      name: updates.name || existingModel.name,
      metadata: {
        ...existingModel.metadata,
        buildingType: updates.buildingType || existingModel.metadata.buildingType || '',
        climateZone: updates.climateZone || existingModel.metadata.climateZone || '',
        location: updates.location || existingModel.metadata.location || '',
        floorArea: updates.floorArea || existingModel.metadata.floorArea || 0,
      },
      updatedAt: new Date(),
    };

    models.set(id, updatedModel);

    logger.info('Model updated successfully', {
      requestId: req.id,
      modelId: id,
      updates: Object.keys(updates),
    });

    res.json(updatedModel);
  } catch (error) {
    logger.error('Error updating model', error instanceof Error ? error : undefined, {
      requestId: req.id,
      modelId: req.params.id,
    });
    throw error;
  }
});

/**
 * Delete an energy model
 * DELETE /api/v1/models/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Model ID is required');
    }

    logger.info('Model deletion requested', { requestId: req.id, modelId: id });

    const existingModel = models.get(id);
    if (!existingModel) {
      throw new NotFoundError('Energy model', id);
    }

    // Delete model
    models.delete(id);

    logger.info('Model deleted successfully', {
      requestId: req.id,
      modelId: id,
      name: existingModel.name,
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting model', error instanceof Error ? error : undefined, {
      requestId: req.id,
      modelId: req.params.id,
    });
    throw error;
  }
});

/**
 * Get model metadata
 * GET /api/v1/models/:id/metadata
 */
router.get('/:id/metadata', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Model ID is required');
    }

    logger.info('Model metadata requested', { requestId: req.id, modelId: id });

    const model = models.get(id);
    if (!model) {
      throw new NotFoundError('Energy model', id);
    }

    res.json({
      id: model.id,
      name: model.name,
      metadata: model.metadata,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  } catch (error) {
    logger.error('Error retrieving model metadata', error instanceof Error ? error : undefined, {
      requestId: req.id,
      modelId: req.params.id,
    });
    throw error;
  }
});

/**
 * Update model metadata
 * PATCH /api/v1/models/:id/metadata
 */
router.patch('/:id/metadata', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Model ID is required');
    }

    logger.info('Model metadata update requested', {
      requestId: req.id,
      modelId: id,
      body: req.body,
    });

    const existingModel = models.get(id);
    if (!existingModel) {
      throw new NotFoundError('Energy model', id);
    }

    // Validate metadata update
    const metadataSchema = z.object({
      buildingType: z.string().min(1).max(100).optional(),
      climateZone: z.string().min(1).max(20).optional(),
      location: z.string().min(1).max(255).optional(),
      floorArea: z.number().positive().optional(),
      tags: z.array(z.string()).optional(),
    });

    const validation = safeValidate(metadataSchema, req.body);
    if (!validation.success) {
      throw new ValidationError('Invalid metadata update request', validation.error.flatten());
    }

    const metadataUpdates = validation.data;

    // Update model with new metadata
    const updatedMetadata = {
      ...existingModel.metadata,
      ...metadataUpdates,
    };

    const updatedModel: EnergyModel = {
      ...existingModel,
      metadata: updatedMetadata,
      updatedAt: new Date(),
    };

    models.set(id, updatedModel);

    logger.info('Model metadata updated successfully', {
      requestId: req.id,
      modelId: id,
      updates: Object.keys(metadataUpdates),
    });

    res.json(updatedModel.metadata);
  } catch (error) {
    logger.error('Error updating model metadata', error instanceof Error ? error : undefined, {
      requestId: req.id,
      modelId: req.params.id,
    });
    throw error;
  }
});

export { router as modelsRouter };
