/**
 * Type definitions for otel-http-logger
 */

/**
 * OpenTelemetry configuration
 */
export interface OtelConfig {
  /** OTLP HTTP collector endpoint URL */
  endpoint: string;
  
  /** Headers for OTLP HTTP collector authentication */
  headers: Record<string, string>;
  
  /** Service name for OTLP resource */
  serviceName: string;
  
  /** Environment name (e.g., 'production', 'staging') */
  environment: string;
}

/**
 * Logger configuration
 */
export interface LoggerConfig extends OtelConfig {}

/**
 * Context logger interface
 */
export interface ContextLogger {
  debug(message: string, attributes?: Record<string, any>): void;
  info(message: string, attributes?: Record<string, any>): void;
  warn(message: string, attributes?: Record<string, any>): void;
  error(message: string, error?: any, attributes?: Record<string, any>): void;
  newContext(context: string): ContextLogger;
}

/**
 * OTLP log record interface
 */
export interface LogRecord {
  timestamp: string;
  observedTimestamp: string;
  severityNumber: number;
  severityText: string;
  body: {
    stringValue: string;
  };
  traceId: string;
  spanId: string;
  attributes: {
    key: string;
    value: {
      stringValue: string;
    };
  }[];
}

/**
 * Log levels for OTLP severity mapping
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}
