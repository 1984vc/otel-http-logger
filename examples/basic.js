/**
 * Basic usage example for otel-http-logger
 * 
 * This example demonstrates how to initialize and use the logger
 * with HyperDX integration for OpenTelemetry logging.
 * 
 * To run this example, set the HYPERDX_API_KEY environment variable:
 * HYPERDX_API_KEY=your_api_key_here node examples/basic.js
 */

// Import the logger
const { initializeLogger, LogLevel } = require('otel-http-logger');

// Get HyperDX API key from environment variable
const HYPERDX_API_KEY = process.env.HYPERDX_API_KEY;

// Example 1: Console-only logger (fallback when no API key is provided)
async function consoleOnlyExample() {
  console.log('=== Console-only Logger Example ===');
  
  // Create a logger with no configuration (console-only)
  const logger = initializeLogger({
    endpoint: '', // Empty endpoint means no OTLP logging
    headers: {},
    serviceName: 'example-service',
    environment: 'development'
  });
  
  // Log messages at different levels
  logger.debug('This is a debug message');
  logger.info('This is an info message');
  logger.warn('This is a warning message');
  logger.error('This is an error message');
  
  // Log with additional attributes
  logger.info('Message with attributes', {
    userId: '12345',
    action: 'login',
    timestamp: new Date().toISOString()
  });
  
  // Log an error with stack trace
  try {
    throw new Error('Something went wrong');
  } catch (error) {
    logger.error('An error occurred', error, {
      component: 'authentication',
      attemptCount: 3
    });
  }
  
  // Create a contextual logger
  const authLogger = logger.newContext('auth');
  authLogger.info('User authenticated');
  
  // Create a nested contextual logger
  const sessionLogger = authLogger.newContext('session');
  sessionLogger.info('Session created');
  
  // Flush logs (no-op for console-only logger)
  await logger.flush();
}

// Example 2: HyperDX OTLP logger
async function otlpLoggerExample() {
  console.log('\n=== HyperDX OTLP Logger Example ===');
  
  if (!HYPERDX_API_KEY) {
    console.log('⚠️  HYPERDX_API_KEY environment variable not set. Skipping OTLP example.');
    console.log('   Set it with: HYPERDX_API_KEY=your_api_key_here node examples/basic.js');
    return;
  }
  
  console.log('Sending logs to HyperDX...');
  
  // Create a logger with HyperDX OTLP configuration
  const logger = initializeLogger({
    endpoint: 'https://in-otel.hyperdx.io/v1/logs',
    headers: {
      'Authorization': HYPERDX_API_KEY,
      'Content-Type': 'application/json'
    },
    serviceName: 'example-service',
    environment: 'development'
  });
  
  // Log messages at different levels
  logger.debug('This is a debug message');
  logger.info('This is an info message');
  logger.warn('This is a warning message');
  logger.error('This is an error message');
  
  // Create a contextual logger
  const apiLogger = logger.newContext('api');
  apiLogger.info('API request received', {
    method: 'GET',
    path: '/users',
    duration: 42
  });
  
  // Important: Flush logs to ensure they are sent to the collector
  console.log('Flushing logs to OTLP collector...');
  await logger.flush();
  console.log('Logs flushed');
}

// Example 3: Using the logger with async context
async function asyncContextExample() {
  console.log('\n=== Async Context Example ===');
  
  // Create a logger
  const logger = initializeLogger({
    endpoint: '', // Console-only for this example
    headers: {},
    serviceName: 'example-service',
    environment: 'development'
  });
  
  // Use withLogger to set the current logger in the async context
  await logger.withLogger(async () => {
    // This function runs with logger as the current logger
    
    // These functions will use the logger from the async context
    await simulateApiCall('/users');
    await simulateApiCall('/products');
    
    // Even in nested async functions, the logger is available
    await simulateNestedCalls();
  });
}

// Helper functions for the async context example
async function simulateApiCall(endpoint) {
  // Import the createLogger function
  const { createLogger } = require('otel-http-logger');
  
  // Create a contextual logger using the current logger from async context
  const apiLogger = createLogger(`api:${endpoint}`);
  
  apiLogger.info('API call started');
  
  // Simulate some async work
  await new Promise(resolve => setTimeout(resolve, 100));
  
  apiLogger.info('API call completed', { duration: '100ms' });
}

async function simulateNestedCalls() {
  const { createLogger } = require('otel-http-logger');
  const nestedLogger = createLogger('nested');
  
  nestedLogger.info('Starting nested calls');
  
  // Simulate more async work
  await new Promise(resolve => setTimeout(resolve, 50));
  
  nestedLogger.info('Nested calls completed');
}

// Run the examples
async function runExamples() {
  await consoleOnlyExample();
  await otlpLoggerExample();
  await asyncContextExample();
}

runExamples().catch(console.error);
