/**
 * OpenTelemetry Backend Implementation
 * 
 * Handles all OpenTelemetry-specific functionality including:
 * - OTLP record creation and transmission
 * - ID generation utilities
 * - OTLP protocol formatting
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

/**
 * Map log level to OTLP severity number
 */
export function mapLogLevelToSeverityNumber(level: LogLevel): number {
  switch (level) {
    case LogLevel.DEBUG: return 5;  // DEBUG
    case LogLevel.INFO:  return 9;  // INFO
    case LogLevel.WARN:  return 13; // WARN
    case LogLevel.ERROR: return 17; // ERROR
    default:             return 9;  // INFO
  }
}

/**
 * Generate a random hex string of specified length
 */
export function generateRandomHexString(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, length);
}

/**
 * Generate a trace ID (16 bytes / 32 hex chars)
 */
export function generateTraceId(): string {
  return generateRandomHexString(32);
}

/**
 * Generate a span ID (8 bytes / 16 hex chars)
 */
export function generateSpanId(): string {
  return generateRandomHexString(16);
}

/**
 * OpenTelemetry Backend
 * Handles OTLP record creation and transmission
 */
export class OtelBackend {
  private endpoint: string;
  private headers: Record<string, string>;
  private serviceName: string;
  private environment: string;
  private logQueue: LogRecord[] = [];
  private parentSpanId: string;
  private parentTraceId: string;
  private lastTimestamp = 0; // Track the last used timestamp

  constructor(config: OtelConfig) {
    // Create parent span
    this.parentTraceId = generateTraceId();
    this.parentSpanId = generateSpanId();
    
    // Configure OTLP logging
    this.endpoint = config.endpoint;
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers
    };
    this.serviceName = config.serviceName;
    this.environment = config.environment;
  }

  /**
   * Get the parent trace ID
   */
  getTraceId(): string {
    return this.parentTraceId;
  }

  /**
   * Get the parent span ID
   */
  getSpanId(): string {
    return this.parentSpanId;
  }

  /**
   * Create a log record and add it to the queue
   */
  createLogRecord(
    level: LogLevel,
    message: string,
    attributes?: Record<string, any>,
    isParentSpan: boolean = false
  ): void {
    // Get current time in nanoseconds
    let now = Date.now() * 1000000; // Convert to nanoseconds
    
    // Ensure unique timestamps by incrementing if same as last
    if (now <= this.lastTimestamp) {
      now = this.lastTimestamp + 1;
    }
    this.lastTimestamp = now;
    
    const spanId = isParentSpan ? this.parentSpanId : generateSpanId();
    
    // Create log attributes
    const logAttributes = [
      {
        key: 'level',
        value: {
          stringValue: level.toLowerCase(),
        },
      },
      {
        key: 'service.name',
        value: {
          stringValue: this.serviceName,
        },
      },
      {
        key: 'environment',
        value: {
          stringValue: this.environment,
        },
      },
    ];
    
    // Add parent span ID reference for child spans
    if (!isParentSpan) {
      logAttributes.push({
        key: 'parent.id',
        value: {
          stringValue: this.parentSpanId,
        },
      });
    }
    
    // Add custom attributes
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        // Convert complex objects to JSON strings
        const attrValue = typeof value === 'object' && value !== null
          ? JSON.stringify(value)
          : String(value);
        
        logAttributes.push({
          key,
          value: {
            stringValue: attrValue,
          },
        });
      });
    }
    
    // Create log record
    const logRecord: LogRecord = {
      timestamp: now.toString(),
      observedTimestamp: now.toString(),
      severityNumber: mapLogLevelToSeverityNumber(level),
      severityText: level,
      body: {
        stringValue: message,
      },
      traceId: this.parentTraceId,
      spanId,
      attributes: logAttributes,
    };
    
    // Add to queue
    this.logQueue.push(logRecord);
  }

  /**
   * Send all queued logs to the OTLP endpoint
   */
  async flush(): Promise<void> {
    if (this.logQueue.length === 0) {
      return;
    }
    
    // Create a copy of the queue and clear it
    const queue = [...this.logQueue];
    this.logQueue = [];
    
    // Create OTLP payload
    const payload = {
      resourceLogs: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: {
                  stringValue: this.serviceName,
                },
              },
              {
                key: 'deployment.environment',
                value: {
                  stringValue: this.environment,
                },
              },
            ],
          },
          scopeLogs: [
            {
              logRecords: queue,
            },
          ],
        },
      ],
    };
    
    try {
      // Send logs to OTLP endpoint
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        console.error(`Failed to send logs: ${response.status} ${response.statusText}`);
      } else {
        console.info(`[${this.serviceName}] Successfully sent ${queue.length} logs to OTLP endpoint`);
      }
    } catch (error) {
      console.error('Error sending logs:', error);
    }
  }
}
