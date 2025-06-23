/**
 * otel-http-logger
 * 
 * A lightweight OpenTelemetry logger for Node.js and browsers
 * with zero dependencies and support for async context propagation.
 */

// Export main logger functionality
export {
  Logger,
  getCurrentLogger,
  createLogger,
  initializeLogger
} from './logger';

// Export OpenTelemetry backend
export {
  OtelBackend,
  generateTraceId,
  generateSpanId
} from './otel';

// Export types
export {
  LogLevel,
  LoggerConfig,
  OtelConfig,
  ContextLogger
} from './types';
