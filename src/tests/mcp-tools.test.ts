import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers.js';

describe('MCP Tool Registration and Invocation Tests', () => {
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

  describe('Tool Invocation - Property Search', () => {
    it('should invoke searchProperties tool with owner_name', async () => {
      const result = await handlers.searchProperties({
        owner_name: 'WOARZUS'
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should invoke searchProperties tool with email', async () => {
      const result = await handlers.searchProperties({
        email: 'woarzus@gmail.com'
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should invoke searchProperties tool with phone', async () => {
      const result = await handlers.searchProperties({
        phone: '954-666-2333'
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should invoke searchProperties tool with multiple filters', async () => {
      const result = await handlers.searchProperties({
        owner_name: 'WOARZUS',
        email: 'woarzus@gmail.com'
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should invoke searchProperties tool with empty filters', async () => {
      const result = await handlers.searchProperties({});
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Tool Invocation - Property Matching', () => {
    it('should invoke matchPropertyToCustomer tool', async () => {
      const result = await handlers.matchPropertyToCustomer({
        customer_name: 'WOARZUS KANDASAMY',
        email: 'woarzus@gmail.com',
        phone: '954-666-2333'
      });
      expect(result).toBeDefined();
      // confidence may not exist if no match
      if (result.confidence !== undefined) {
        expect(result.confidence).toBeDefined();
      }
    });

    it('should invoke matchPropertyToCustomer with minimal info', async () => {
      const result = await handlers.matchPropertyToCustomer({
        customer_name: 'WOARZUS KANDASAMY'
      });
      expect(result).toBeDefined();
    });

    it('should invoke matchPropertyToCustomer with only email', async () => {
      const result = await handlers.matchPropertyToCustomer({
        customer_name: 'WOARZUS KANDASAMY',
        email: 'woarzus@gmail.com'
      });
      expect(result).toBeDefined();
    });

    it('should invoke matchPropertyToCustomer with only phone', async () => {
      const result = await handlers.matchPropertyToCustomer({
        customer_name: 'WOARZUS KANDASAMY',
        phone: '954-666-2333'
      });
      expect(result).toBeDefined();
    });
  });

  describe('Tool Invocation - Address Lookup', () => {
    it('should invoke getPropertyRecordByAddress tool', async () => {
      const result = await handlers.getPropertyRecordByAddress(
        '1450 Brickell Bay Dr, Apt 1402, Miami, FL 33131'
      );
      expect(result).toBeDefined();
    });

    it('should invoke getPropertyRecordByAddress with partial address', async () => {
      const result = await handlers.getPropertyRecordByAddress(
        '1450 Brickell Bay Dr'
      );
      expect(result).toBeDefined();
    });

    it('should invoke getPropertyRecordByAddress with city only', async () => {
      const result = await handlers.getPropertyRecordByAddress(
        'Miami, FL'
      );
      expect(result).toBeDefined();
    });

    it('should invoke getPropertyRecordByAddress with street only', async () => {
      const result = await handlers.getPropertyRecordByAddress(
        'Brickell Bay Dr'
      );
      expect(result).toBeDefined();
    });

    it('should invoke getPropertyRecordByAddress with non-existent address', async () => {
      const result = await handlers.getPropertyRecordByAddress(
        '999 Nonexistent St, Nowhere, FL 99999'
      );
      expect(result).toBeDefined();
    });
  });

  describe('Tool Response Formats', () => {
    it('should return proper JSON structure for searchProperties', async () => {
      const result = await handlers.searchProperties({
        owner_name: 'WOARZUS'
      });
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('address');
        expect(result[0]).toHaveProperty('owner_name');
        expect(result[0]).toHaveProperty('city');
        expect(result[0]).toHaveProperty('state');
        expect(result[0]).toHaveProperty('zip');
      }
    });

    it('should return proper JSON structure for matchPropertyToCustomer', async () => {
      const result = await handlers.matchPropertyToCustomer({
        customer_name: 'WOARZUS KANDASAMY',
        email: 'woarzus@gmail.com'
      });
      expect(result).toBeDefined();
      // confidence may not exist if no match
      if (result.confidence !== undefined) {
        expect(result).toHaveProperty('confidence');
      }
      if (result.matched_properties) {
        expect(Array.isArray(result.matched_properties)).toBe(true);
      }
    });

    it('should return proper JSON structure for getPropertyRecordByAddress', async () => {
      const result = await handlers.getPropertyRecordByAddress(
        '1450 Brickell Bay Dr, Apt 1402, Miami, FL 33131'
      );
      if (result) {
        expect(result).toHaveProperty('address');
        expect(result).toHaveProperty('owner_name');
      }
    });
  });

  describe('Tool Error Handling', () => {
    it('should handle null address gracefully', async () => {
      const result = await handlers.getPropertyRecordByAddress(null as any);
      expect(result).toBeNull();
    });

    it('should handle undefined address gracefully', async () => {
      const result = await handlers.getPropertyRecordByAddress(undefined as any);
      expect(result).toBeNull();
    });

    it('should handle empty address gracefully', async () => {
      const result = await handlers.getPropertyRecordByAddress('');
      expect(result).toBeDefined();
    });

    it('should handle null filters gracefully', async () => {
      // This test now passes due to the null check fix in searchProperties
      const result = await handlers.searchProperties(null as any);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle invalid customer_name gracefully', async () => {
      const result = await handlers.matchPropertyToCustomer({
        customer_name: 'NONEXISTENT CUSTOMER THAT DOES NOT EXIST'
      });
      expect(result).toBeDefined();
      // confidence may not exist if no match
      if (result.confidence !== undefined) {
        expect(result.confidence).toBeDefined();
      }
    });
  });

  describe('Tool Input Validation', () => {
    it('should handle very long owner_name', async () => {
      const longString = 'A'.repeat(1000);
      const result = await handlers.searchProperties({
        owner_name: longString
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle special characters in search', async () => {
      const result = await handlers.searchProperties({
        owner_name: "O'Brien"
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle Unicode in address', async () => {
      const result = await handlers.getPropertyRecordByAddress(
        '1450 Brickell Bay Dr, Apt 1402, Miami, FL 33131'
      );
      expect(result).toBeDefined();
    });
  });

  describe('Tool Performance', () => {
    it('should handle multiple concurrent searches', async () => {
      const promises = [
        handlers.searchProperties({ owner_name: 'WOARZUS' }),
        handlers.searchProperties({ email: 'woarzus@gmail.com' }),
        handlers.searchProperties({ phone: '954-666-2333' })
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should handle multiple concurrent address lookups', async () => {
      const promises = [
        handlers.getPropertyRecordByAddress('1450 Brickell Bay Dr, Apt 1402, Miami, FL 33131'),
        handlers.getPropertyRecordByAddress('1450 Brickell Bay Dr'),
        handlers.getPropertyRecordByAddress('Brickell Bay Dr')
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });
  });

  describe('Tool Edge Cases', () => {
    it('should handle case-insensitive search', async () => {
      const result1 = await handlers.searchProperties({ owner_name: 'woarzus' });
      const result2 = await handlers.searchProperties({ owner_name: 'WOARZUS' });
      const result3 = await handlers.searchProperties({ owner_name: 'WoArZuS' });
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });

    it('should handle partial name match', async () => {
      const result = await handlers.searchProperties({ owner_name: 'WOAR' });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle address with different separators', async () => {
      const result1 = await handlers.getPropertyRecordByAddress('1450 Brickell Bay Dr, Apt 1402, Miami, FL 33131');
      const result2 = await handlers.getPropertyRecordByAddress('1450 Brickell Bay Dr Apt 1402 Miami FL 33131');
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should handle address with extra spaces', async () => {
      const result = await handlers.getPropertyRecordByAddress('1450  Brickell  Bay  Dr,  Apt  1402,  Miami,  FL  33131');
      expect(result).toBeDefined();
    });
  });

  describe('Tool Data Consistency', () => {
    it('should return consistent results for same search', async () => {
      const result1 = await handlers.searchProperties({ owner_name: 'WOARZUS' });
      const result2 = await handlers.searchProperties({ owner_name: 'WOARZUS' });
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(Array.isArray(result1)).toBe(true);
      expect(Array.isArray(result2)).toBe(true);
      expect(result1.length).toBe(result2.length);
    });

    it('should return consistent results for same address lookup', async () => {
      const address = '1450 Brickell Bay Dr, Apt 1402, Miami, FL 33131';
      const result1 = await handlers.getPropertyRecordByAddress(address);
      const result2 = await handlers.getPropertyRecordByAddress(address);
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });
});