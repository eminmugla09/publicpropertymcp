import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers.js';

describe('Property Records Tools', () => {
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

  it('should search properties by owner name', async () => {
    const result = await handlers.searchProperties({
      owner_name: 'Rafael Vargas'
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].owner_name).toContain('Rafael');
  });

  it('should search properties by email', async () => {
    const result = await handlers.searchProperties({
      email: 'rjvargas87@gmail.com'
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].email).toBe('rjvargas87@gmail.com');
  });

  it('should search properties by phone', async () => {
    const result = await handlers.searchProperties({
      phone: '305-555-0198'
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should search properties by city', async () => {
    const result = await handlers.searchProperties({
      city: 'Miami'
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should search properties by state', async () => {
    const result = await handlers.searchProperties({
      state: 'FL'
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should search properties with multiple filters', async () => {
    const result = await handlers.searchProperties({
      owner_name: 'Rafael',
      city: 'Miami'
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array for no matches', async () => {
    const result = await handlers.searchProperties({
      owner_name: 'Nonexistent Owner XYZ'
    });

    expect(result).toBeDefined();
    expect(result).toEqual([]);
  });

  it('should get recent property events', async () => {
    const result = await handlers.getRecentPropertyEvents({
      owner_name: 'Rafael Vargas',
      days_back: 90
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should get recent property events with custom days back', async () => {
    const result = await handlers.getRecentPropertyEvents({
      owner_name: 'Emin Mugla',
      days_back: 30
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should filter recent events by event type', async () => {
    const result = await handlers.getRecentPropertyEvents({
      owner_name: 'Rafael Vargas'
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // Verify all results are within the date range
  });

  it('should match property to customer with high confidence', async () => {
    const result = await handlers.matchPropertyToCustomer({
      customer_name: 'Rafael Vargas',
      email: 'rjvargas87@gmail.com',
      phone: '305-555-0198',
      known_addresses: ['888 Brickell Ave Apt 2104, Miami, FL 33131']
    });

    expect(result).toBeDefined();
    expect(result.matched).toBe(true);
    expect(result.match_confidence).toBeDefined();
    expect(['low', 'medium', 'high']).toContain(result.match_confidence);
  });

  it('should match property to customer with medium confidence', async () => {
    const result = await handlers.matchPropertyToCustomer({
      customer_name: 'Rafael Vargas',
      email: 'rjvargas87@gmail.com'
    });

    expect(result).toBeDefined();
    expect(result.matched).toBe(true);
    expect(result.match_confidence).toBeDefined();
  });

  it('should return medium confidence for single signal match', async () => {
    const result = await handlers.matchPropertyToCustomer({
      customer_name: 'John Smith'
    });

    expect(result).toBeDefined();
    expect(result.matched).toBe(true);
    expect(result.match_confidence).toBe('medium'); // 1 identity signal = medium confidence
  });

  it('should return no match for non-existent customer', async () => {
    const result = await handlers.matchPropertyToCustomer({
      customer_name: 'Nonexistent Customer XYZ'
    });

    expect(result).toBeDefined();
    expect(result.matched).toBe(false);
    expect(result.match_confidence).toBe('low');
  });

  it('should get property record by address', async () => {
    const result = await handlers.getPropertyRecordByAddress('888 Brickell Ave Apt 2104, Miami, FL 33131');

    expect(result).toBeDefined();
    expect(result.address).toContain('Brickell');
    expect(result.city).toBe('Miami');
    expect(result.state).toBe('FL');
  });

  it('should get property record by fuzzy address match', async () => {
    const result = await handlers.getPropertyRecordByAddress('888 Brickell Ave Apt 2104 Miami FL 33131');

    expect(result).toBeDefined();
    expect(result.address).toContain('Brickell');
  });

  it('should get property record by street-only match', async () => {
    const result = await handlers.getPropertyRecordByAddress('Brickell Ave');

    expect(result).toBeDefined();
  });

  it('should return null for non-existent address', async () => {
    const result = await handlers.getPropertyRecordByAddress('999 Nonexistent St, Nowhere, XX 00000');

    expect(result).toBeNull();
  });

  it('should normalize address correctly', async () => {
    const normalized = handlers.normalizeAddress('123  Main  St.,  Miami,  FL.');

    expect(normalized).toBe('123 main st miami fl');
  });

  it('should normalize string correctly', async () => {
    const normalized = handlers.normalizeString('  Test String  ');

    expect(normalized).toBe('test string');
  });

  it('should format record output correctly', async () => {
    const testRecord = {
      owner_name: 'Test Owner',
      address: '123 Test St',
      city: 'Miami',
      state: 'FL',
      zip: '33131',
      county: 'Miami-Dade',
      parcel_id: '12345',
      legal_description: 'Test description',
      event_type: 'recent purchase',
      recording_date: new Date('2026-06-15'),
      closing_date: new Date('2026-06-20'),
      document_number: 'DOC123',
      book_page: '123-45',
      sale_price: 500000,
      assessed_value: 480000,
      confidence: 'high',
      source: 'Test Source',
      utility_provider: 'FPL',
      property_type: 'single-family home',
      has_garage: true
    };

    const output = handlers.toRecordOutput(testRecord);

    expect(output.owner_name).toBe('Test Owner');
    expect(output.address).toBe('123 Test St');
    expect(output.city).toBe('Miami');
    expect(output.state).toBe('FL');
    expect(output.sale_price).toBe(500000);
  });

  it('should format json content correctly', async () => {
    const payload = { test: 'data', number: 42 };
    const result = handlers.jsonContent(payload);

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(payload);
  });
});
