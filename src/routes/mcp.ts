import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { OpenStudioMCPServer } from '../services/mcp-server';
import { logger } from '../utils';
import { ValidationError, MCPProtocolError } from '../utils/errors';
import { safeValidate } from '../utils/validation';

const router = Router();

// MCP request validation schema
const mcpRequestSchema = z.object({
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

// Initialize MCP server instance for REST API calls
const mcpServer = new OpenStudioMCPServer();

/**
 * MCP Tools endpoint - List available tools
 * GET /api/v1/mcp/tools
 */
router.get('/tools', async (req: Request, res: Response) => {
  try {
    logger.info('MCP tools list requested', { requestId: req.id });

    // This would normally go through the MCP server's handler
    // For now, we'll return the static list of tools
    const tools = [
      {
        name: 'create_energy_model_nlp',
        description:
          'Create a new OpenStudio energy model from natural language description with automatic parameter extraction',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description:
                'Natural language description of the building (e.g., "A 10,000 square foot office building in New York")',
            },
          },
          required: ['description'],
        },
      },
      {
        name: 'create_energy_model',
        description: 'Create a new OpenStudio energy model from structured parameters',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Natural language description of the building',
            },
            buildingType: {
              type: 'string',
              description: 'Type of building (office, residential, retail, etc.)',
            },
            location: {
              type: 'string',
              description: 'Geographic location or climate zone',
            },
            floorArea: {
              type: 'number',
              description: 'Total floor area in square meters',
            },
          },
          required: ['description', 'buildingType', 'location', 'floorArea'],
        },
      },
      {
        name: 'run_energy_simulation',
        description: 'Run an energy simulation on an existing model',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: {
              type: 'string',
              description: 'ID of the energy model to simulate',
            },
            weatherFile: {
              type: 'string',
              description: 'Path to weather file (EPW format)',
            },
            outputVariables: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of output variables to include in results',
            },
          },
          required: ['modelId'],
        },
      },
      {
        name: 'validate_model_ashrae',
        description: 'Validate an energy model against ASHRAE 90.1 standards',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: {
              type: 'string',
              description: 'ID of the energy model to validate',
            },
            standard: {
              type: 'string',
              enum: ['ASHRAE 90.1-2019', 'ASHRAE 90.1-2016', 'ASHRAE 90.1-2013'],
              description: 'ASHRAE standard version to validate against',
            },
          },
          required: ['modelId', 'standard'],
        },
      },
      {
        name: 'export_to_radiance',
        description: 'Export model geometry to Radiance for daylight analysis',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: {
              type: 'string',
              description: 'ID of the energy model to export',
            },
            includeWindows: {
              type: 'boolean',
              description: 'Include window surfaces in export',
              default: true,
            },
            materialProperties: {
              type: 'boolean',
              description: 'Include material optical properties',
              default: true,
            },
          },
          required: ['modelId'],
        },
      },
      {
        name: 'get_simulation_results',
        description: 'Retrieve results from a completed energy simulation',
        inputSchema: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'ID of the simulation job',
            },
            format: {
              type: 'string',
              enum: ['json', 'csv', 'html'],
              description: 'Output format for results',
              default: 'json',
            },
          },
          required: ['jobId'],
        },
      },
    ];

    res.json({
      tools,
      count: tools.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error listing MCP tools', error instanceof Error ? error : undefined, {
      requestId: req.id,
    });
    throw new MCPProtocolError('Failed to list MCP tools');
  }
});

/**
 * MCP Tool execution endpoint
 * POST /api/v1/mcp/tools/:toolName
 */
router.post('/tools/:toolName', async (req: Request, res: Response) => {
  try {
    const { toolName } = req.params;
    const toolArgs = req.body;

    logger.info('MCP tool execution requested', {
      requestId: req.id,
      toolName,
      args: toolArgs,
    });

    // Validate tool exists
    const validTools = [
      'create_energy_model_nlp',
      'create_energy_model',
      'run_energy_simulation',
      'validate_model_ashrae',
      'export_to_radiance',
      'get_simulation_results',
    ];

    if (!validTools.includes(toolName)) {
      throw new ValidationError(`Unknown tool: ${toolName}`);
    }

    // Execute the tool using the MCP server's internal handler
    let result: { content: Array<{ type: string; text: string }> };
    switch (toolName) {
      case 'create_energy_model_nlp':
        result = await (
          mcpServer as unknown as {
            handleCreateEnergyModelNLP: (
              args: Record<string, unknown>
            ) => Promise<{ content: Array<{ type: string; text: string }> }>;
          }
        ).handleCreateEnergyModelNLP(toolArgs);
        break;
      case 'create_energy_model':
        result = await (
          mcpServer as unknown as {
            handleCreateEnergyModel: (
              args: Record<string, unknown>
            ) => Promise<{ content: Array<{ type: string; text: string }> }>;
          }
        ).handleCreateEnergyModel(toolArgs);
        break;
      case 'run_energy_simulation':
        result = await (
          mcpServer as unknown as {
            handleRunEnergySimulation: (
              args: Record<string, unknown>
            ) => Promise<{ content: Array<{ type: string; text: string }> }>;
          }
        ).handleRunEnergySimulation(toolArgs);
        break;
      case 'validate_model_ashrae':
        result = await (
          mcpServer as unknown as {
            handleValidateModelAshrae: (
              args: Record<string, unknown>
            ) => Promise<{ content: Array<{ type: string; text: string }> }>;
          }
        ).handleValidateModelAshrae(toolArgs);
        break;
      case 'export_to_radiance':
        result = await (
          mcpServer as unknown as {
            handleExportToRadiance: (
              args: Record<string, unknown>
            ) => Promise<{ content: Array<{ type: string; text: string }> }>;
          }
        ).handleExportToRadiance(toolArgs);
        break;
      case 'get_simulation_results':
        result = await (
          mcpServer as unknown as {
            handleGetSimulationResults: (
              args: Record<string, unknown>
            ) => Promise<{ content: Array<{ type: string; text: string }> }>;
          }
        ).handleGetSimulationResults(toolArgs);
        break;
      default:
        throw new ValidationError(`Tool ${toolName} not implemented`);
    }

    res.json({
      success: true,
      tool: toolName,
      result,
      timestamp: new Date().toISOString(),
      requestId: req.id,
    });
  } catch (error) {
    logger.error('Error executing MCP tool', error instanceof Error ? error : undefined, {
      requestId: req.id,
      toolName: req.params.toolName,
    });
    throw error;
  }
});

/**
 * MCP Protocol endpoint for raw MCP requests
 * POST /api/v1/mcp/request
 */
router.post('/request', async (req: Request, res: Response) => {
  try {
    const validation = safeValidate(mcpRequestSchema, req.body);

    if (!validation.success) {
      throw new ValidationError('Invalid MCP request format', validation.error.flatten());
    }

    const { id, method, params } = validation.data;

    logger.info('MCP protocol request received', {
      requestId: req.id,
      mcpId: id,
      method,
      params,
    });

    // Handle different MCP methods
    let result;
    switch (method) {
      case 'tools/list':
        // Return tools list (similar to GET /tools)
        result = await handleToolsList();
        break;
      case 'tools/call':
        // Call a specific tool
        if (!params?.name || typeof params.name !== 'string') {
          throw new ValidationError('Tool name is required for tools/call');
        }
        result = await handleToolCall(
          params.name,
          (params.arguments as Record<string, unknown>) || {}
        );
        break;
      default:
        throw new MCPProtocolError(`Unsupported MCP method: ${method}`);
    }

    res.json({
      jsonrpc: '2.0',
      id,
      result,
    });
  } catch (error) {
    logger.error('Error processing MCP request', error instanceof Error ? error : undefined, {
      requestId: req.id,
    });

    // Return MCP-compliant error response
    const mcpError =
      error instanceof MCPProtocolError
        ? error
        : new MCPProtocolError((error as Error)?.message || 'Unknown error');

    res.status(400).json({
      jsonrpc: '2.0',
      id: req.body?.id || req.id,
      error: {
        code: mcpError.mcpErrorCode,
        message: mcpError.message,
      },
    });
  }
});

/**
 * Helper function to handle tools/list method
 */
async function handleToolsList(): Promise<{ tools: Array<{ name: string; description: string }> }> {
  // This would normally call the MCP server's list tools handler
  // For now, return the static list
  return {
    tools: [
      {
        name: 'create_energy_model_nlp',
        description:
          'Create a new OpenStudio energy model from natural language description with automatic parameter extraction',
      },
      {
        name: 'create_energy_model',
        description: 'Create a new OpenStudio energy model from structured parameters',
      },
      {
        name: 'run_energy_simulation',
        description: 'Run an energy simulation on an existing model',
      },
      {
        name: 'validate_model_ashrae',
        description: 'Validate an energy model against ASHRAE 90.1 standards',
      },
      {
        name: 'export_to_radiance',
        description: 'Export model geometry to Radiance for daylight analysis',
      },
      {
        name: 'get_simulation_results',
        description: 'Retrieve results from a completed energy simulation',
      },
    ],
  };
}

/**
 * Helper function to handle tools/call method
 */
async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (toolName) {
    case 'create_energy_model_nlp':
      return await (
        mcpServer as unknown as {
          handleCreateEnergyModelNLP: (
            args: Record<string, unknown>
          ) => Promise<{ content: Array<{ type: string; text: string }> }>;
        }
      ).handleCreateEnergyModelNLP(args);
    case 'create_energy_model':
      return await (
        mcpServer as unknown as {
          handleCreateEnergyModel: (
            args: Record<string, unknown>
          ) => Promise<{ content: Array<{ type: string; text: string }> }>;
        }
      ).handleCreateEnergyModel(args);
    case 'run_energy_simulation':
      return await (
        mcpServer as unknown as {
          handleRunEnergySimulation: (
            args: Record<string, unknown>
          ) => Promise<{ content: Array<{ type: string; text: string }> }>;
        }
      ).handleRunEnergySimulation(args);
    case 'validate_model_ashrae':
      return await (
        mcpServer as unknown as {
          handleValidateModelAshrae: (
            args: Record<string, unknown>
          ) => Promise<{ content: Array<{ type: string; text: string }> }>;
        }
      ).handleValidateModelAshrae(args);
    case 'export_to_radiance':
      return await (
        mcpServer as unknown as {
          handleExportToRadiance: (
            args: Record<string, unknown>
          ) => Promise<{ content: Array<{ type: string; text: string }> }>;
        }
      ).handleExportToRadiance(args);
    case 'get_simulation_results':
      return await (
        mcpServer as unknown as {
          handleGetSimulationResults: (
            args: Record<string, unknown>
          ) => Promise<{ content: Array<{ type: string; text: string }> }>;
        }
      ).handleGetSimulationResults(args);
    default:
      throw new ValidationError(`Unknown tool: ${toolName}`);
  }
}

export { router as mcpRouter };
