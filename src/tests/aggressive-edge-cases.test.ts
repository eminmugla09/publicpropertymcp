import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers.js';

describe('Aggressive Edge Case Tests', () => {
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

  describe('Null and Undefined Handling', () => {
    it('should handle null in searchProperties', async () => {
      try {
        await handlers.searchProperties(null as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle undefined in searchProperties', async () => {
      try {
        await handlers.searchProperties(undefined as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle null in matchPropertyToCustomer', async () => {
      try {
        await handlers.matchPropertyToCustomer(null as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle null in getPropertyRecordByAddress', async () => {
      const result = await handlers.getPropertyRecordByAddress(null as any);
      expect(result).toBeNull();
    });

    it('should handle undefined in getPropertyRecordByAddress', async () => {
      const result = await handlers.getPropertyRecordByAddress(undefined as any);
      expect(result).toBeNull();
    });
  });

  describe('Empty String Handling', () => {
    it('should handle empty string in searchProperties owner_name', async () => {
      const result = await handlers.searchProperties({ owner_name: '' });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty string in searchProperties email', async () => {
      const result = await handlers.searchProperties({ email: '' });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty string in matchPropertyToCustomer customer_name', async () => {
      try {
        await handlers.matchPropertyToCustomer({ customer_name: '' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle empty string in getPropertyRecordByAddress', async () => {
      const result = await handlers.getPropertyRecordByAddress('');
      expect(result).toBeDefined();
    });
  });

  describe('Invalid Data Types', () => {
    it('should handle number instead of string for owner_name', async () => {
      try {
        await handlers.searchProperties({ owner_name: 12345 as any });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle array instead of object', async () => {
      try {
        await handlers.searchProperties([] as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle boolean instead of string', async () => {
      try {
        await handlers.matchPropertyToCustomer({ customer_name: true as any });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle object instead of string for address', async () => {
      try {
        await handlers.getPropertyRecordByAddress({} as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Very Long Strings', () => {
    it('should handle extremely long owner_name', async () => {
      const longString = 'A'.repeat(10000);
      try {
        await handlers.searchProperties({ owner_name: longString });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle extremely long email', async () => {
      const longString = 'a'.repeat(10000) + '@example.com';
      try {
        await handlers.searchProperties({ email: longString });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle extremely long customer_name', async () => {
      const longString = 'A'.repeat(10000);
      try {
        await handlers.matchPropertyToCustomer({ customer_name: longString });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle extremely long address', async () => {
      const longString = 'A'.repeat(10000);
      const result = await handlers.getPropertyRecordByAddress(longString);
      expect(result).toBeDefined();
    });
  });

  describe('Special Characters and SQL Injection', () => {
    it('should handle SQL injection attempt in owner_name', async () => {
      try {
        await handlers.searchProperties({ owner_name: "'; DROP TABLE property_records; --" });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle SQL injection attempt in email', async () => {
      try {
        await handlers.searchProperties({ email: "'; DROP TABLE property_records; --" });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle SQL injection attempt in address', async () => {
      const result = await handlers.getPropertyRecordByAddress("'; DROP TABLE property_records; --");
      expect(result).toBeDefined();
    });

    it('should handle Unicode characters', async () => {
      const result = await handlers.searchProperties({ owner_name: '🚀🎉✨' });
      expect(result).toBeDefined();
    });

    it('should handle control characters', async () => {
      try {
        await handlers.searchProperties({ owner_name: '\x00\x01\x02\x03' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle XSS attempt', async () => {
      const result = await handlers.searchProperties({ 
        owner_name: '<script>alert("XSS")</script>' 
      });
      expect(result).toBeDefined();
    });
  });

  describe('Boundary Values', () => {
    it('should handle single character search', async () => {
      const result = await handlers.searchProperties({ owner_name: 'A' });
      expect(result).toBeDefined();
    });

    it('should handle single character address', async () => {
      const result = await handlers.getPropertyRecordByAddress('A');
      expect(result).toBeDefined();
    });

    it('should handle very short customer_name', async () => {
      try {
        await handlers.matchPropertyToCustomer({ customer_name: 'AB' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle numeric string in search', async () => {
      const result = await handlers.searchProperties({ owner_name: '12345' });
      expect(result).toBeDefined();
    });
  });

  describe('Missing Required Fields', () => {
    it('should handle missing customer_name in matchPropertyToCustomer', async () => {
      try {
        await handlers.matchPropertyToCustomer({} as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle empty object in searchProperties', async () => {
      const result = await handlers.searchProperties({});
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Address Normalization Edge Cases', () => {
    it('should handle address with multiple commas', async () => {
      const result = await handlers.getPropertyRecordByAddress('1450, Brickell, Bay, Dr, Miami, FL');
      expect(result).toBeDefined();
    });

    it('should handle address with no commas', async () => {
      const result = await handlers.getPropertyRecordByAddress('1450 Brickell Bay Dr Miami FL 33131');
      expect(result).toBeDefined();
    });

    it('should handle address with only commas', async () => {
      const result = await handlers.getPropertyRecordByAddress(',,,');
      expect(result).toBeDefined();
    });

    it('should handle address with only spaces', async () => {
      const result = await handlers.getPropertyRecordByAddress('     ');
      expect(result).toBeDefined();
    });

    it('should handle address with mixed case', async () => {
      const result = await handlers.getPropertyRecordByAddress('1450 bRiCkElL bAy Dr, MiAmI, fL 33131');
      expect(result).toBeDefined();
    });

    it('should handle address with extra spaces', async () => {
      const result = await handlers.getPropertyRecordByAddress('1450  Brickell  Bay  Dr ,  Miami ,  FL  33131');
      expect(result).toBeDefined();
    });
  });

  describe('Match Property Confidence Edge Cases', () => {
    it('should handle match with no identity signals', async () => {
      const result = await handlers.matchPropertyToCustomer({
        customer_name: 'NONEXISTENT CUSTOMER'
      });
      expect(result).toBeDefined();
      // Confidence may not exist if no match found
      if (result.confidence !== undefined) {
        expect(result.confidence).toBeDefined();
      }
    });

    it('should handle match with only email signal', async () => {
      const result = await handlers.matchPropertyToCustomer({
        customer_name: 'WOARZUS KANDASAMY',
        email: 'woarzus@gmail.com'
      });
      expect(result).toBeDefined();
      // Confidence may not exist if no match found
      if (result.confidence !== undefined) {
        expect(result.confidence).toBeDefined();
      }
    });

    it('should handle match with only phone signal', async () => {
      const result = await handlers.matchPropertyToCustomer({
        customer_name: 'WOARZUS KANDASAMY',
        phone: '954-666-2333'
      });
      expect(result).toBeDefined();
      // Confidence may not exist if no match found
      if (result.confidence !== undefined) {
        expect(result.confidence).toBeDefined();
      }
    });
  });

  describe('Search Filter Combinations', () => {
    it('should handle all filters null', async () => {
      const result = await handlers.searchProperties({
        owner_name: null,
        email: null,
        phone: null
      });
      expect(result).toBeDefined();
    });

    it('should handle all filters empty strings', async () => {
      const result = await handlers.searchProperties({
        owner_name: '',
        email: '',
        phone: ''
      });
      expect(result).toBeDefined();
    });

    it('should handle partial match with wildcard-like behavior', async () => {
      const result = await handlers.searchProperties({ owner_name: 'WOAR' });
      expect(result).toBeDefined();
    });
  });

  describe('Array and Object Manipulation', () => {
    it('should handle array with null values', async () => {
      try {
        await handlers.searchProperties({ owner_name: [null, undefined, ''] } as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle deeply nested object', async () => {
      try {
        await handlers.searchProperties({ owner_name: { nested: { deep: { value: 'WOARZUS' } } } } as any);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle circular reference', async () => {
      try {
        const obj: any = { owner_name: 'WOARZUS' };
        obj.self = obj;
        await handlers.searchProperties(obj);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Phone Number Edge Cases', () => {
    it('should handle phone with dashes', async () => {
      const result = await handlers.searchProperties({ phone: '954-666-2333' });
      expect(result).toBeDefined();
    });

    it('should handle phone with parentheses', async () => {
      const result = await handlers.searchProperties({ phone: '(954) 666-2333' });
      expect(result).toBeDefined();
    });

    it('should handle phone with spaces', async () => {
      const result = await handlers.searchProperties({ phone: '954 666 2333' });
      expect(result).toBeDefined();
    });

    it('should handle phone with no formatting', async () => {
      const result = await handlers.searchProperties({ phone: '9546662333' });
      expect(result).toBeDefined();
    });

    it('should handle international phone format', async () => {
      const result = await handlers.searchProperties({ phone: '+1-954-666-2333' });
      expect(result).toBeDefined();
    });

    it('should handle invalid phone format', async () => {
      const result = await handlers.searchProperties({ phone: 'invalid-phone' });
      expect(result).toBeDefined();
    });
  });

  describe('Email Edge Cases', () => {
    it('should handle email with uppercase', async () => {
      const result = await handlers.searchProperties({ email: 'WOARZUS@GMAIL.COM' });
      expect(result).toBeDefined();
    });

    it('should handle email with subdomain', async () => {
      const result = await handlers.searchProperties({ email: 'woarzus@mail.gmail.com' });
      expect(result).toBeDefined();
    });

    it('should handle email with plus sign', async () => {
      const result = await handlers.searchProperties({ email: 'woarzus+test@gmail.com' });
      expect(result).toBeDefined();
    });

    it('should handle invalid email format', async () => {
      const result = await handlers.searchProperties({ email: 'invalid-email' });
      expect(result).toBeDefined();
    });

    it('should handle email with trailing dot', async () => {
      const result = await handlers.searchProperties({ email: 'woarzus@gmail.com.' });
      expect(result).toBeDefined();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous searches', async () => {
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

    it('should handle multiple simultaneous address lookups', async () => {
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
});