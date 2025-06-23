/**
 * Simple Logger with Optional OpenTelemetry Support
 * 
 * A lightweight logger that can optionally send logs to an OTLP HTTP endpoint.
 * Supports async_hooks for automatic logger context propagation.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { OtelBackend, OtelConfig, LogLevel } from './otel';

/**
 * Logger configuration (same as OtelConfig for backward compatibility)
 */
export interface OtelLoggerConfig extends OtelConfig {}

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

// Create AsyncLocalStorage to store the current logger instance
const loggerStore = new AsyncLocalStorage<Logger>();

// Track if we've warned about missing OTEL context
let hasWarnedNoOtel = false;

/**
 * Get the current logger from AsyncLocalStorage
 * @returns The current logger instance or a new console-only logger if not in a logger context
 */
export function getCurrentLogger(): Logger {
  const logger = loggerStore.getStore();
  if (!logger) {
    if (!hasWarnedNoOtel) {
      console.warn('No logger found in current async context. Creating a console-only logger. OTEL logging is disabled.');
      hasWarnedNoOtel = true;
    }
    return new Logger();
  }
  return logger;
}

/**
 * Create a contextual logger using the current logger instance
 * @param context The context name to prepend to log messages
 * @returns A contextual logger that uses the current logger instance
 */
export function createLogger(context: string): ContextLogger {
  return getCurrentLogger().newContext(context);
}

/**
 * Initialize the logger with configuration
 * @param config Logger configuration object
 * @returns The initialized logger
 */
export function initializeLogger(config: OtelLoggerConfig): Logger;
/**
 * Initialize the logger with service name (uses default HyperDX configuration)
 * @param serviceName The service name
 * @returns The initialized logger
 */
export function initializeLogger(serviceName: string): Logger;
export function initializeLogger(configOrServiceName: OtelLoggerConfig | string): Logger {
  if (typeof configOrServiceName === 'string') {
    // Backward compatibility: use default HyperDX configuration
    return new Logger({
      endpoint: 'https://in-otel.hyperdx.io/v1/logs',
      headers: { 'Authorization': '65d3bda0-849a-4cc5-a2b2-2bbe5623b087' },
      serviceName: configOrServiceName,
      environment: 'production'
    });
  }
  
  return new Logger(configOrServiceName);
}

/**
 * Main Logger Class
 * Provides logging functionality with optional OpenTelemetry backend
 */
export class Logger implements ContextLogger {
  private otelBackend?: OtelBackend;
  private serviceName: string;
  private environment: string;
  private contextPrefix: string;

  /**
   * Create a new Logger
   * If no config is provided, the logger will only log to console
   */
  constructor(config?: OtelLoggerConfig, contextPrefix: string = '') {
    this.contextPrefix = contextPrefix;
    
    if (config) {
      // Configure OTLP logging
      this.otelBackend = new OtelBackend(config);
      this.serviceName = config.serviceName;
      this.environment = config.environment;
      
      // Log initialization only for root logger (no context prefix)
      if (!contextPrefix) {
        this.otelBackend.createLogRecord(
          LogLevel.INFO,
          `Initialized logger for ${this.serviceName}`,
          { environment: this.environment },
          true
        );
        
        console.info(`[${this.serviceName}] Logger initialized (trace: ${this.otelBackend.getTraceId().substring(0, 8)}...)`);
      }
    } else {
      // Console-only logging
      this.serviceName = 'console-logger';
      this.environment = 'development';
      
      // Log initialization only for root logger (no context prefix)
      if (!contextPrefix) {
        console.info(`[${this.serviceName}] Console-only logger initialized (OTEL logging disabled)`);
      }
    }
  }

  /**
   * Execute a function with this logger set as the current logger in the async context
   * @param fn Function to execute within the logger context
   * @returns The result of the function
   */
  async withLogger<T>(fn: () => T | Promise<T>): Promise<T> {
    try {
      // Run the function in the logger context
      const result = await Promise.resolve(loggerStore.run(this, fn));
      await this.flush();
      return result;
    } catch (error: any) {
      // Re-throw the error after flushing logs
      this.error("withLogger error - flushing", error);
      await this.flush();
      throw error;
    }
  }

  /**
   * Format message with context prefix
   */
  private formatMessage(message: string): string {
    return this.contextPrefix ? `[${this.contextPrefix}] ${message}` : message;
  }

  /**
   * Log debug message
   */
  debug(message: string, attributes?: Record<string, any>): void {
    const formattedMessage = this.formatMessage(message);
    this.otelBackend?.createLogRecord(LogLevel.DEBUG, formattedMessage, attributes);
    console.debug(`[${this.serviceName}] [DEBUG] ${formattedMessage}`, attributes || '');
  }

  /**
   * Log info message
   */
  info(message: string, attributes?: Record<string, any>): void {
    const formattedMessage = this.formatMessage(message);
    this.otelBackend?.createLogRecord(LogLevel.INFO, formattedMessage, attributes);
    console.info(`[${this.serviceName}] [INFO] ${formattedMessage}`, attributes || '');
  }

  /**
   * Log warning message
   */
  warn(message: string, attributes?: Record<string, any>): void {
    const formattedMessage = this.formatMessage(message);
    this.otelBackend?.createLogRecord(LogLevel.WARN, formattedMessage, attributes);
    console.warn(`[${this.serviceName}] [WARN] ${formattedMessage}`, attributes || '');
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, attributes?: Record<string, any>): void {
    const formattedMessage = this.formatMessage(message);
    const errorAttributes = { ...attributes };
    
    if (error) {
      errorAttributes.errorName = error.name;
      errorAttributes.errorMessage = error.message;
      errorAttributes.errorStack = error.stack;
    }
    
    this.otelBackend?.createLogRecord(LogLevel.ERROR, formattedMessage, errorAttributes);
    console.error(`[${this.serviceName}] [ERROR] ${formattedMessage}`, error || '', attributes || '');
  }

  /**
   * Create a new logger with context
   * 
   * @param context The context to add to log messages
   * @returns A new logger that prepends context to messages
   */
  newContext(context: string): ContextLogger {
    const newContextPrefix = this.contextPrefix 
      ? `${this.contextPrefix}:${context}` 
      : context;
    
    // Create a new logger instance with the same configuration but different context
    const contextLogger = new Logger(
      this.otelBackend ? {
        endpoint: '', // Not used for context loggers
        headers: {},  // Not used for context loggers
        serviceName: this.serviceName,
        environment: this.environment
      } : undefined,
      newContextPrefix
    );
    
    // Share the same OTEL backend instance to avoid creating multiple connections
    contextLogger.otelBackend = this.otelBackend;
    
    return contextLogger;
  }

  /**
   * Send all queued logs to the OTLP endpoint
   * If no OTLP endpoint is configured, this is a no-op
   */
  async flush(): Promise<void> {
    await this.otelBackend?.flush();
  }
}

// Export the Logger class as OtelLogger for backward compatibility
export const OtelLogger = Logger;

// Re-export LogLevel for backward compatibility
export { LogLevel };
