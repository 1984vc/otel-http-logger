/**
 * Context Propagation Example for otel-http-logger with HyperDX integration
 * 
 * This example demonstrates how to use the logger with async context
 * to automatically propagate the logger across async boundaries.
 * 
 * To run this example, set the HYPERDX_API_KEY environment variable:
 * HYPERDX_API_KEY=your_api_key_here node examples/context.js
 */

// Import the logger
const { initializeLogger, createLogger, getCurrentLogger } = require('otel-http-logger');

// Get HyperDX API key from environment variable
const HYPERDX_API_KEY = process.env.HYPERDX_API_KEY;

// Simulate a web server with middleware and route handlers
class ExampleServer {
  constructor() {
    // Check if HyperDX API key is available
    const useHyperDX = !!HYPERDX_API_KEY;
    
    if (useHyperDX) {
      console.log('HyperDX API key found. Logs will be sent to HyperDX.');
    } else {
      console.log('⚠️  HYPERDX_API_KEY environment variable not set. Using console-only logging.');
      console.log('   Set it with: HYPERDX_API_KEY=your_api_key_here node examples/context.js');
    }
    
    // Initialize the root logger for the server
    this.logger = initializeLogger({
      endpoint: useHyperDX ? 'https://in-otel.hyperdx.io/v1/logs' : '',
      headers: useHyperDX ? {
        'Authorization': HYPERDX_API_KEY,
        'Content-Type': 'application/json'
      } : {},
      serviceName: 'example-server',
      environment: 'development'
    });
    
    this.logger.info('Server initialized');
  }
  
  // Simulate handling a request
  async handleRequest(method, path, body) {
    // Use withLogger to set the current logger in the async context
    return this.logger.withLogger(async () => {
      // Create a request-specific logger
      const requestLogger = createLogger('request');
      
      requestLogger.info(`${method} ${path}`, {
        method,
        path,
        contentLength: body ? JSON.stringify(body).length : 0
      });
      
      try {
        // Apply middleware
        await this.authMiddleware();
        await this.loggingMiddleware();
        
        // Route the request
        let result;
        if (path === '/users' && method === 'GET') {
          result = await this.getUsersHandler();
        } else if (path === '/users' && method === 'POST') {
          result = await this.createUserHandler(body);
        } else {
          throw new Error(`Route not found: ${method} ${path}`);
        }
        
        requestLogger.info('Request completed successfully');
        return result;
      } catch (error) {
        requestLogger.error('Request failed', error);
        throw error;
      }
    });
  }
  
  // Middleware examples
  async authMiddleware() {
    const logger = createLogger('middleware:auth');
    logger.debug('Authenticating request');
    
    // Simulate authentication check
    await new Promise(resolve => setTimeout(resolve, 50));
    
    logger.debug('Authentication successful');
  }
  
  async loggingMiddleware() {
    const logger = createLogger('middleware:logging');
    logger.debug('Logging request details');
    
    // Get the current logger from the async context
    const currentLogger = getCurrentLogger();
    logger.debug('Current logger retrieved from async context');
  }
  
  // Route handler examples
  async getUsersHandler() {
    const logger = createLogger('handler:getUsers');
    logger.info('Fetching users');
    
    // Simulate database query
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const users = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ];
    
    logger.info('Users fetched successfully', { count: users.length });
    
    // Simulate calling another service
    await this.callUserStatsService(users);
    
    return users;
  }
  
  async createUserHandler(userData) {
    const logger = createLogger('handler:createUser');
    logger.info('Creating new user', { userData });
    
    // Simulate database operation
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const newUser = {
      id: 3,
      ...userData,
      createdAt: new Date().toISOString()
    };
    
    logger.info('User created successfully', { userId: newUser.id });
    return newUser;
  }
  
  // Simulate calling another service
  async callUserStatsService(users) {
    const logger = createLogger('service:userStats');
    logger.info('Calling user stats service', { userCount: users.length });
    
    // Simulate external service call
    await new Promise(resolve => setTimeout(resolve, 75));
    
    logger.info('User stats service call completed');
  }
}

// Run the example
async function runExample() {
  console.log('=== Context Propagation Example with HyperDX ===');
  
  const server = new ExampleServer();
  
  try {
    // Simulate GET request
    console.log('\nSimulating GET /users request:');
    const users = await server.handleRequest('GET', '/users');
    console.log('Response:', JSON.stringify(users, null, 2));
    
    // Simulate POST request
    console.log('\nSimulating POST /users request:');
    const newUser = await server.handleRequest('POST', '/users', { name: 'Charlie', email: 'charlie@example.com' });
    console.log('Response:', JSON.stringify(newUser, null, 2));
    
    // Simulate error
    console.log('\nSimulating request to non-existent route:');
    try {
      await server.handleRequest('GET', '/invalid');
    } catch (error) {
      console.log('Error caught:', error.message);
    }
  } catch (error) {
    console.error('Example failed:', error);
  } finally {
    // If we're using HyperDX, make sure to flush logs before exiting
    if (HYPERDX_API_KEY) {
      console.log('\nFlushing logs to HyperDX...');
      await server.logger.flush();
      console.log('Logs flushed');
    }
  }
}

runExample().catch(console.error);
