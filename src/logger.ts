/**
 * Simple Logger with Optional OpenTelemetry Support
 * 
 * A lightweight logger that can optionally send logs to an OTLP HTTP endpoint.
 * Supports async_hooks for automatic logger context propagation.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { OtelBackend } from './otel';
import { LoggerConfig, ContextLogger, LogLevel } from './types';

// Create AsyncLocalStorage to store the current logger instance
const loggerStore = new AsyncLocalStorage<Logger>();

// Track if we've warned about missing logger context
let hasWarnedNoContext = false;

/**
 * Get the current logger from AsyncLocalStorage
 * @returns The current logger instance or a new console-only logger if not in a logger context
 */
export function getCurrentLogger(): Logger {
  const logger = loggerStore.getStore();
  if (!logger) {
    if (!hasWarnedNoContext) {
      console.warn('No logger found in current async context. Creating a console-only logger. OTEL logging is disabled.');
      hasWarnedNoContext = true;
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
export function initializeLogger(config: LoggerConfig): Logger {
  return new Logger(config);
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
   * @param config Optional configuration for the logger
   * @param contextPrefix Optional context prefix for log messages
   */
  constructor(config?: LoggerConfig, contextPrefix: string = '') {
    this.contextPrefix = contextPrefix;
    
    if (config) {
      // Configure OTLP logging
      this.otelBackend = new OtelBackend(config);
      this.serviceName = config.serviceName;
      this.environment = config.environment;
      
      // Log initialization only for root logger (no context prefix)
      if (!contextPrefix) {
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
   * @param message The message to log
   * @param attributes Optional attributes to include with the log
   */
  debug(message: string, attributes?: Record<string, any>): void {
    const formattedMessage = this.formatMessage(message);
    this.otelBackend?.createLogRecord(LogLevel.DEBUG, formattedMessage, attributes);
    console.debug(`[${this.serviceName}] [DEBUG] ${formattedMessage}`, attributes || '');
  }

  /**
   * Log info message
   * @param message The message to log
   * @param attributes Optional attributes to include with the log
   */
  info(message: string, attributes?: Record<string, any>): void {
    const formattedMessage = this.formatMessage(message);
    this.otelBackend?.createLogRecord(LogLevel.INFO, formattedMessage, attributes);
    console.info(`[${this.serviceName}] [INFO] ${formattedMessage}`, attributes || '');
  }

  /**
   * Log warning message
   * @param message The message to log
   * @param attributes Optional attributes to include with the log
   */
  warn(message: string, attributes?: Record<string, any>): void {
    const formattedMessage = this.formatMessage(message);
    this.otelBackend?.createLogRecord(LogLevel.WARN, formattedMessage, attributes);
    console.warn(`[${this.serviceName}] [WARN] ${formattedMessage}`, attributes || '');
  }

  /**
   * Log error message
   * @param message The message to log
   * @param error Optional error object to include with the log
   * @param attributes Optional attributes to include with the log
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
   * @returns Promise that resolves when logs are flushed
   */
  async flush(): Promise<void> {
    await this.otelBackend?.flush();
  }
}
