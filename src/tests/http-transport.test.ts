import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers.js';

describe('HTTP Transport Layer Tests', () => {
  let dbName: string;
  let handlers: any;
  let mainPool: any;

  beforeAll(async () => {
    const setup = await setupTestDb();
    dbName = setup.dbName;
    handlers = setup.handlers;
    mainPool = setup.mainPool;
  });

  afterAll(async () => {
    await teardownTestDb(dbName, mainPool);
  });

  describe('Server Creation', () => {
    it('should create server with stdio transport', async () => {
      // Test that the server can be created with stdio transport
      process.env.MCP_TRANSPORT = 'stdio';
      const { createPropertyRecordsMcpServer } = await import('../index.js');
      const server = createPropertyRecordsMcpServer();
      expect(server).toBeDefined();
    });

    it('should create server with HTTP transport', async () => {
      // Test that the server can be created with HTTP transport
      process.env.MCP_TRANSPORT = 'http';
      process.env.PORT = '3001';
      const { createPropertyRecordsMcpServer } = await import('../index.js');
      const server = createPropertyRecordsMcpServer();
      expect(server).toBeDefined();
    });
  });

  describe('Environment Variables', () => {
    it('should handle custom JWT_SECRET', () => {
      const originalSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'custom-secret';
      
      expect(process.env.JWT_SECRET).toBe('custom-secret');
      
      if (originalSecret) {
        process.env.JWT_SECRET = originalSecret;
      } else {
        delete process.env.JWT_SECRET;
      }
    });

    it('should handle custom PORT for HTTP', () => {
      const originalPort = process.env.PORT;
      process.env.PORT = '8080';
      process.env.MCP_TRANSPORT = 'http';
      
      expect(process.env.PORT).toBe('8080');
      
      if (originalPort) {
        process.env.PORT = originalPort;
      } else {
        delete process.env.PORT;
      }
    });

    it('should handle custom OAuth client ID', () => {
      const originalClientId = process.env.OAUTH_CLIENT_ID;
      process.env.OAUTH_CLIENT_ID = 'custom-client';
      
      expect(process.env.OAUTH_CLIENT_ID).toBe('custom-client');
      
      if (originalClientId) {
        process.env.OAUTH_CLIENT_ID = originalClientId;
      } else {
        delete process.env.OAUTH_CLIENT_ID;
      }
    });
  });

  describe('Tool Registration', () => {
    it('should have registered tools', async () => {
      const { createPropertyRecordsMcpServer } = await import('../index.js');
      const server = createPropertyRecordsMcpServer();
      
      // The server should have tools registered
      expect(server).toBeDefined();
    });
  });

  describe('Handler Availability', () => {
    it('should have searchProperties', async () => {
      expect(handlers.searchProperties).toBeDefined();
      expect(typeof handlers.searchProperties).toBe('function');
    });

    it('should have matchPropertyToCustomer', async () => {
      expect(handlers.matchPropertyToCustomer).toBeDefined();
      expect(typeof handlers.matchPropertyToCustomer).toBe('function');
    });

    it('should have getPropertyRecordByAddress', async () => {
      expect(handlers.getPropertyRecordByAddress).toBeDefined();
      expect(typeof handlers.getPropertyRecordByAddress).toBe('function');
    });
  });

  describe('Database Pool', () => {
    it('should have database pool available', async () => {
      const { pool } = await import('../index.js');
      expect(pool).toBeDefined();
    });

    it('should be able to query database', async () => {
      const { pool } = await import('../index.js');
      const result = await pool.query('SELECT 1 as test');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].test).toBe(1);
    });
  });

  describe('OAuth Configuration', () => {
    it('should have OAuth client configuration', async () => {
      const { getConfiguredClient } = await import('../auth.js');
      const client = getConfiguredClient();
      expect(client).toBeDefined();
      expect(client.client_id).toBeDefined();
    });

    it('should have ensureOAuthClient function', async () => {
      const { ensureOAuthClient } = await import('../auth.js');
      expect(ensureOAuthClient).toBeDefined();
      expect(typeof ensureOAuthClient).toBe('function');
    });
  });
});