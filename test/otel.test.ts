import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OtelBackend, LogLevel, generateTraceId, generateSpanId } from '../src';

describe('OpenTelemetry Backend', () => {
  // Mock fetch
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  // Mock console methods
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Reset fetch mock
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ID Generation', () => {
    it('should generate valid trace IDs', () => {
      const traceId = generateTraceId();
      expect(traceId).toHaveLength(32);
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should generate valid span IDs', () => {
      const spanId = generateSpanId();
      expect(spanId).toHaveLength(16);
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
        ids.add(generateSpanId());
      }
      // We should have 200 unique IDs (100 trace IDs + 100 span IDs)
      expect(ids.size).toBe(200);
    });
  });

  describe('Log Record Creation', () => {
    it('should create log records with the correct structure', () => {
      const backend = new OtelBackend({
        endpoint: 'https://test.endpoint/v1/logs',
        headers: { 'Authorization': 'test-token' },
        serviceName: 'test-service',
        environment: 'test'
      });

      // Mock the flush method to capture the log record
      let capturedRecord: any = null;
      const originalFlush = backend.flush;
      backend.flush = vi.fn().mockImplementation(async function(this: any) {
        if (this.logQueue.length > 0) {
          capturedRecord = this.logQueue[0];
        }
        return originalFlush.call(this);
      });

      backend.createLogRecord(LogLevel.INFO, 'Test message', { key: 'value' });
      
      // Flush to capture the record
      backend.flush();
      
      // Verify record structure
      expect(capturedRecord).toHaveProperty('timestamp');
      expect(capturedRecord).toHaveProperty('observedTimestamp');
      expect(capturedRecord).toHaveProperty('severityNumber', 9); // INFO = 9
      expect(capturedRecord).toHaveProperty('severityText', 'INFO');
      expect(capturedRecord).toHaveProperty('body.stringValue', 'Test message');
      expect(capturedRecord).toHaveProperty('traceId');
      expect(capturedRecord).toHaveProperty('spanId');
      
      // Verify attributes
      const attributes = capturedRecord.attributes;
      expect(attributes).toContainEqual({
        key: 'level',
        value: { stringValue: 'info' }
      });
      expect(attributes).toContainEqual({
        key: 'service.name',
        value: { stringValue: 'test-service' }
      });
      expect(attributes).toContainEqual({
        key: 'environment',
        value: { stringValue: 'test' }
      });
      expect(attributes).toContainEqual({
        key: 'key',
        value: { stringValue: 'value' }
      });
    });
  });

  describe('Log Transmission', () => {
    it('should send logs to the OTLP endpoint', async () => {
      const backend = new OtelBackend({
        endpoint: 'https://test.endpoint/v1/logs',
        headers: { 'Authorization': 'test-token' },
        serviceName: 'test-service',
        environment: 'test'
      });

      backend.createLogRecord(LogLevel.INFO, 'Test message');
      await backend.flush();

      // Check that fetch was called with the correct arguments
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.endpoint/v1/logs',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'test-token'
          })
        })
      );

      // Check that the payload contains the log record
      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload).toHaveProperty('resourceLogs');
      expect(payload.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(1);
      expect(payload.resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue).toBe('Test message');
    });

    it('should handle HTTP errors', async () => {
      // Mock fetch to return an error
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const backend = new OtelBackend({
        endpoint: 'https://test.endpoint/v1/logs',
        headers: { 'Authorization': 'test-token' },
        serviceName: 'test-service',
        environment: 'test'
      });
      
      // Reduce retry delay for testing
      (backend as any).retryDelay = 10;
      (backend as any).maxRetries = 1; // Reduce retries for faster test

      backend.createLogRecord(LogLevel.INFO, 'Test message');
      await backend.flush();

      // Check that console.error was called
      expect(console.error).toHaveBeenCalled();
      
      // Check that fetch was called the expected number of times
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should skip sending if no endpoint is configured', async () => {
      const backend = new OtelBackend({
        endpoint: '',
        headers: {},
        serviceName: 'test-service',
        environment: 'test'
      });

      backend.createLogRecord(LogLevel.INFO, 'Test message');
      await backend.flush();

      // Check that fetch was not called
      expect(mockFetch).not.toHaveBeenCalled();
      
      // Check that console.info was called with a message about skipping
      expect(console.info).toHaveBeenCalledWith(
        expect.stringContaining('No OTLP endpoint configured')
      );
    });
  });
});
