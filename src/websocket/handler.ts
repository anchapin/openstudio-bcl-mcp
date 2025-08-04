import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils';
import { ValidationError, MCPProtocolError } from '../utils/errors';
import { safeValidate } from '../utils/validation';
import { z } from 'zod';

// WebSocket message schemas
const wsMessageSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

const mcpWebSocketSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

// Connected clients tracking
const connectedClients = new Map<string, Socket>();

/**
 * WebSocket handler for real-time communication
 */
export function webSocketHandler(io: SocketIOServer): void {
  logger.info('WebSocket handler initialized');

  io.on('connection', (socket: Socket) => {
    const clientId = socket.id;
    const clientIP = socket.handshake.address;
    const userAgent = socket.handshake.headers['user-agent'] || 'unknown';

    logger.info('WebSocket client connected', {
      clientId,
      clientIP,
      userAgent,
      totalClients: io.engine.clientsCount,
    });

    // Track connected client
    connectedClients.set(clientId, socket);

    // Handle client authentication (optional)
    socket.on('authenticate', (data) => {
      handleAuthentication(socket, data);
    });

    // Handle MCP protocol messages
    socket.on('mcp:request', (data) => {
      handleMCPRequest(socket, data);
    });

    // Handle simulation progress subscriptions
    socket.on('simulation:subscribe', (data) => {
      handleSimulationSubscribe(socket, data);
    });

    socket.on('simulation:unsubscribe', (data) => {
      handleSimulationUnsubscribe(socket, data);
    });

    // Handle model change subscriptions
    socket.on('model:subscribe', (data) => {
      handleModelSubscribe(socket, data);
    });

    socket.on('model:unsubscribe', (data) => {
      handleModelUnsubscribe(socket, data);
    });

    // Handle real-time tool execution
    socket.on('tool:execute', (data) => {
      handleToolExecution(socket, data);
    });

    // Handle ping-pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Handle generic messages
    socket.on('message', (data) => {
      handleGenericMessage(socket, data);
    });

    // Handle client disconnect
    socket.on('disconnect', (reason) => {
      logger.info('WebSocket client disconnected', {
        clientId,
        reason,
        totalClients: io.engine.clientsCount - 1,
      });

      // Remove from tracking
      connectedClients.delete(clientId);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.error('WebSocket client error', error, {
        clientId,
        clientIP,
      });
    });

    // Send welcome message
    socket.emit('connected', {
      clientId,
      timestamp: new Date().toISOString(),
      serverVersion: '0.1.0',
      supportedProtocols: ['mcp', 'openstudio'],
    });
  });

  // Handle server-level errors
  io.on('error', (error) => {
    logger.error('WebSocket server error', error);
  });
}

/**
 * Handle client authentication
 */
function handleAuthentication(socket: Socket, data: unknown): void {
  try {
    logger.debug('Authentication request received', {
      clientId: socket.id,
      data,
    });

    // For now, we'll accept all connections
    // In a real implementation, you would validate credentials here
    socket.emit('auth:success', {
      authenticated: true,
      timestamp: new Date().toISOString(),
    });

    logger.info('Client authenticated successfully', {
      clientId: socket.id,
    });
  } catch (error) {
    logger.error('Authentication failed', error instanceof Error ? error : undefined, {
      clientId: socket.id,
    });

    socket.emit('auth:error', {
      error: 'Authentication failed',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handle MCP protocol requests over WebSocket
 */
function handleMCPRequest(socket: Socket, data: unknown): void {
  try {
    const validation = safeValidate(mcpWebSocketSchema, data);
    if (!validation.success) {
      throw new ValidationError('Invalid MCP request format', validation.error.flatten());
    }

    const { jsonrpc, id, method, params } = validation.data;

    logger.info('MCP WebSocket request received', {
      clientId: socket.id,
      id,
      method,
      params,
    });

    // Handle different MCP methods
    switch (method) {
      case 'tools/list':
        handleMCPToolsList(socket, id);
        break;
      case 'tools/call':
        handleMCPToolCall(socket, id, params);
        break;
      default:
        throw new MCPProtocolError(`Unsupported MCP method: ${method}`);
    }
  } catch (error) {
    logger.error('Error handling MCP request', error instanceof Error ? error : undefined, {
      clientId: socket.id,
    });

    const mcpError = error instanceof MCPProtocolError ? error : new MCPProtocolError((error as Error)?.message || 'Unknown error');
    
    socket.emit('mcp:error', {
      jsonrpc: '2.0',
      id: (data as any)?.id || 'unknown',
      error: {
        code: mcpError.mcpErrorCode,
        message: mcpError.message,
      },
    });
  }
}

/**
 * Handle simulation progress subscriptions
 */
function handleSimulationSubscribe(socket: Socket, data: unknown): void {
  try {
    const schema = z.object({
      jobId: z.string().uuid(),
    });

    const validation = safeValidate(schema, data);
    if (!validation.success) {
      throw new ValidationError('Invalid subscription request', validation.error.flatten());
    }

    const { jobId } = validation.data;

    // Join simulation room for real-time updates
    socket.join(`simulation:${jobId}`);

    logger.info('Client subscribed to simulation updates', {
      clientId: socket.id,
      jobId,
    });

    socket.emit('simulation:subscribed', {
      jobId,
      timestamp: new Date().toISOString(),
    });

    // Send current status if available
    // This would query the actual simulation status in a real implementation
    socket.emit('simulation:status', {
      jobId,
      status: 'running',
      progress: 45,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error handling simulation subscription', error instanceof Error ? error : undefined, {
      clientId: socket.id,
    });

    socket.emit('simulation:error', {
      error: error instanceof Error ? error.message : 'Subscription failed',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handle simulation unsubscribe
 */
function handleSimulationUnsubscribe(socket: Socket, data: unknown): void {
  try {
    const schema = z.object({
      jobId: z.string().uuid(),
    });

    const validation = safeValidate(schema, data);
    if (!validation.success) {
      throw new ValidationError('Invalid unsubscribe request', validation.error.flatten());
    }

    const { jobId } = validation.data;

    // Leave simulation room
    socket.leave(`simulation:${jobId}`);

    logger.info('Client unsubscribed from simulation updates', {
      clientId: socket.id,
      jobId,
    });

    socket.emit('simulation:unsubscribed', {
      jobId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error handling simulation unsubscribe', error instanceof Error ? error : undefined, {
      clientId: socket.id,
    });
  }
}

/**
 * Handle model subscriptions
 */
function handleModelSubscribe(socket: Socket, data: unknown): void {
  try {
    const schema = z.object({
      modelId: z.string().uuid(),
    });

    const validation = safeValidate(schema, data);
    if (!validation.success) {
      throw new ValidationError('Invalid model subscription request', validation.error.flatten());
    }

    const { modelId } = validation.data;

    // Join model room for real-time updates
    socket.join(`model:${modelId}`);

    logger.info('Client subscribed to model updates', {
      clientId: socket.id,
      modelId,
    });

    socket.emit('model:subscribed', {
      modelId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error handling model subscription', error instanceof Error ? error : undefined, {
      clientId: socket.id,
    });

    socket.emit('model:error', {
      error: error instanceof Error ? error.message : 'Model subscription failed',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handle model unsubscribe
 */
function handleModelUnsubscribe(socket: Socket, data: unknown): void {
  try {
    const schema = z.object({
      modelId: z.string().uuid(),
    });

    const validation = safeValidate(schema, data);
    if (!validation.success) {
      throw new ValidationError('Invalid model unsubscribe request', validation.error.flatten());
    }

    const { modelId } = validation.data;

    // Leave model room
    socket.leave(`model:${modelId}`);

    logger.info('Client unsubscribed from model updates', {
      clientId: socket.id,
      modelId,
    });

    socket.emit('model:unsubscribed', {
      modelId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error handling model unsubscribe', error instanceof Error ? error : undefined, {
      clientId: socket.id,
    });
  }
}

/**
 * Handle real-time tool execution
 */
function handleToolExecution(socket: Socket, data: unknown): void {
  try {
    const schema = z.object({
      toolName: z.string().min(1),
      arguments: z.record(z.unknown()).optional(),
      requestId: z.string().min(1),
    });

    const validation = safeValidate(schema, data);
    if (!validation.success) {
      throw new ValidationError('Invalid tool execution request', validation.error.flatten());
    }

    const { toolName, arguments: args, requestId } = validation.data;

    logger.info('Real-time tool execution requested', {
      clientId: socket.id,
      toolName,
      requestId,
      args,
    });

    // Acknowledge request
    socket.emit('tool:acknowledged', {
      requestId,
      toolName,
      timestamp: new Date().toISOString(),
    });

    // Execute tool asynchronously and send progress updates
    executeToolWithProgress(socket, toolName, args || {}, requestId);
  } catch (error) {
    logger.error('Error handling tool execution', error instanceof Error ? error : undefined, {
      clientId: socket.id,
    });

    socket.emit('tool:error', {
      error: error instanceof Error ? error.message : 'Tool execution failed',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handle generic messages
 */
function handleGenericMessage(socket: Socket, data: unknown): void {
  try {
    const validation = safeValidate(wsMessageSchema, data);
    if (!validation.success) {
      throw new ValidationError('Invalid message format', validation.error.flatten());
    }

    const { type, id, data: messageData } = validation.data;

    logger.debug('Generic WebSocket message received', {
      clientId: socket.id,
      type,
      id,
      data: messageData,
    });

    // Echo message back for testing
    socket.emit('message:echo', {
      originalType: type,
      originalId: id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error handling generic message', error instanceof Error ? error : undefined, {
      clientId: socket.id,
    });
  }
}

/**
 * Handle MCP tools list request
 */
function handleMCPToolsList(socket: Socket, requestId: string): void {
  const tools = [
    {
      name: 'create_energy_model',
      description: 'Create a new OpenStudio energy model from natural language description',
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
  ];

  socket.emit('mcp:response', {
    jsonrpc: '2.0',
    id: requestId,
    result: { tools },
  });
}

/**
 * Handle MCP tool call request
 */
function handleMCPToolCall(socket: Socket, requestId: string, params: unknown): void {
  // This would integrate with the actual MCP server tool handlers
  // For now, send a mock response
  socket.emit('mcp:response', {
    jsonrpc: '2.0',
    id: requestId,
    result: {
      content: [
        {
          type: 'text',
          text: `Tool execution started via WebSocket. Request ID: ${requestId}`,
        },
      ],
    },
  });
}

/**
 * Execute tool with progress updates
 */
async function executeToolWithProgress(
  socket: Socket,
  toolName: string,
  args: Record<string, unknown>,
  requestId: string
): Promise<void> {
  try {
    // Send progress updates
    const progressSteps = [10, 30, 50, 70, 90, 100];
    
    for (const progress of progressSteps) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
      
      socket.emit('tool:progress', {
        requestId,
        toolName,
        progress,
        timestamp: new Date().toISOString(),
      });
    }

    // Send completion
    socket.emit('tool:completed', {
      requestId,
      toolName,
      result: {
        success: true,
        message: `Tool ${toolName} completed successfully`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    socket.emit('tool:failed', {
      requestId,
      toolName,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Broadcast simulation progress to subscribed clients
 */
export function broadcastSimulationProgress(
  io: SocketIOServer,
  jobId: string,
  status: string,
  progress: number
): void {
  io.to(`simulation:${jobId}`).emit('simulation:progress', {
    jobId,
    status,
    progress,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast model changes to subscribed clients
 */
export function broadcastModelChange(
  io: SocketIOServer,
  modelId: string,
  changeType: string,
  changes: Record<string, unknown>
): void {
  io.to(`model:${modelId}`).emit('model:changed', {
    modelId,
    changeType,
    changes,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get connected clients count
 */
export function getConnectedClientsCount(): number {
  return connectedClients.size;
}

/**
 * Get connected client IDs
 */
export function getConnectedClientIds(): string[] {
  return Array.from(connectedClients.keys());
}
