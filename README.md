# otel-http-logger

A lightweight OpenTelemetry logger for Node.js, Bun, and browsers with zero dependencies and support for async context propagation. Includes built-in support for HyperDX.

## Features

- **Zero Dependencies**: Works with vanilla JavaScript/Node.js/Bun
- **OpenTelemetry Compatible**: Sends logs to any OTLP HTTP collector
- **Context Propagation**: Uses AsyncLocalStorage for automatic logger context across async boundaries
- **TypeScript Support**: Written in TypeScript with full type definitions
- **Compatible with many JS runtimes**: NodeJS, Browser, Bun, Cloudflare(Miniflare), Deno

## Installation

```bash
npm install @1984vc/otel-http-logger
```

Or with yarn:

```bash
yarn add @1984vc/otel-http-logger
```

Or with bun:

```bash
bun add @1984vc/otel-http-logger
```

## Quick Start

```javascript
const { initializeLogger, LogLevel } = require('otel-http-logger');

// Initialize a console-only logger (no OTLP)
const logger = initializeLogger({
  endpoint: '', // Empty endpoint means no OTLP logging
  headers: {},
  serviceName: 'my-service',
  environment: 'development'
});

// Log at different levels
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

// Log with additional attributes
logger.info('User logged in', {
  userId: '12345',
  loginTime: new Date().toISOString()
});

// Log errors with stack traces
try {
  throw new Error('Something went wrong');
} catch (error) {
  logger.error('An error occurred', error, {
    component: 'authentication'
  });
}
```

## OTLP Logging

### HyperDX Example

```javascript
const { initializeLogger } = require('otel-http-logger');

// Get HyperDX API key from environment variable
const HYPERDX_API_KEY = process.env.HYPERDX_API_KEY;

// Initialize a logger with HyperDX configuration
const logger = initializeLogger({
  endpoint: 'https://in-otel.hyperdx.io/v1/logs',
  headers: {
    'Authorization': HYPERDX_API_KEY,
    'Content-Type': 'application/json'
  },
  serviceName: 'my-service',
  environment: 'production'
});

// Log as usual
logger.info('This will be sent to HyperDX');

// Important: Flush logs before your application exits
await logger.flush();
```

## Context Propagation

The logger supports context propagation using AsyncLocalStorage, which allows you to create contextual loggers that are automatically available throughout your async call stack:

```javascript
const { initializeLogger, createLogger } = require('otel-http-logger');

const logger = initializeLogger({
  endpoint: 'https://your-otlp-collector/v1/logs',
  headers: { 'Authorization': 'Bearer your-token' },
  serviceName: 'my-service',
  environment: 'production'
});

// Use withLogger to set the current logger in the async context
await logger.withLogger(async () => {
  // This function and all async functions called from it
  // will have access to the logger via createLogger
  
  await processRequest();
});

async function processRequest() {
  // Create a contextual logger using the current logger from async context
  const requestLogger = createLogger('request');
  
  requestLogger.info('Processing request');
  
  // Even in nested async functions, the logger is available
  await callDatabase();
}

async function callDatabase() {
  const dbLogger = createLogger('database');
  dbLogger.info('Executing query');
}
```

## API Reference

### `initializeLogger(config)`

Initializes a new logger with the provided configuration.

```typescript
interface LoggerConfig {
  endpoint: string;        // OTLP HTTP collector endpoint URL
  headers: Record<string, string>; // Headers for OTLP HTTP collector
  serviceName: string;     // Service name for OTLP resource
  environment: string;     // Environment name (e.g., 'production', 'staging')
}
```

### `createLogger(context)`

Creates a contextual logger using the current logger from the async context.

```typescript
function createLogger(context: string): ContextLogger;
```

### `getCurrentLogger()`

Gets the current logger from the async context.

```typescript
function getCurrentLogger(): Logger;
```

### `Logger`

The main logger class.

```typescript
class Logger implements ContextLogger {
  constructor(config?: LoggerConfig, contextPrefix?: string);
  
  debug(message: string, attributes?: Record<string, any>): void;
  info(message: string, attributes?: Record<string, any>): void;
  warn(message: string, attributes?: Record<string, any>): void;
  error(message: string, error?: Error, attributes?: Record<string, any>): void;
  
  newContext(context: string): ContextLogger;
  
  async withLogger<T>(fn: () => T | Promise<T>): Promise<T>;
  
  async flush(): Promise<void>;
}
```

### `LogLevel`

Enum for log levels.

```typescript
enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}
```

## Examples

See the [examples](./examples) directory for more detailed examples:

- [Basic Usage](./examples/basic.js) - Demonstrates basic logging and HyperDX integration
- [Context Propagation](./examples/context.js) - Shows how to use async context for logging

To run the examples with [HyperDX](https://hyperdx.io) integration:

```bash
# Set your HyperDX API key
export HYPERDX_API_KEY=your_api_key_here

# Run the examples with Node.js
node examples/basic.js
node examples/context.js

# Or run with Bun
bun examples/basic.js
bun examples/context.js
```

## License

MIT
