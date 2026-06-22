-- Seed data for Property Records MCP Server
-- This script populates the database with mock data based on actual county formats

-- Insert sample users
INSERT INTO users (email, password_hash, full_name) VALUES
  ('rjvargas87@gmail.com', '$2b$10$QGJwQAV6gsxC07uvxykOJOAo50PnPaE9VUUPtcf50cr5Z9L2x9Eb6', 'Rafael Vargas'),
  ('woarzus@gmail.com', '$2b$10$QGJwQAV6gsxC07uvxykOJOAo50PnPaE9VUUPtcf50cr5Z9L2x9Eb6', 'Emin Mugla')
ON CONFLICT (email) DO NOTHING;

-- Get user IDs for property records
DO $$
DECLARE
  rafael_id UUID;
  emin_id UUID;
BEGIN
  SELECT id INTO rafael_id FROM users WHERE email = 'rjvargas87@gmail.com';
  SELECT id INTO emin_id FROM users WHERE email = 'woarzus@gmail.com';

  -- Insert Rafael Vargas property records (Miami-Dade County format)
  INSERT INTO property_records (
    user_id, owner_name, alternate_names, email, phone, address, city, state, zip, county,
    parcel_id, legal_description, event_type, recording_date, closing_date, document_number,
    book_page, sale_price, assessed_value, confidence, source, utility_provider,
    property_type, has_garage, known_property
  ) VALUES
  (
    rafael_id,
    'Rafael Vargas',
    ARRAY['Rafael J. Vargas', 'R. Vargas'],
    'rjvargas87@gmail.com',
    '305-555-0198',
    '888 Brickell Ave Apt 2104',
    'Miami',
    'FL',
    '33131',
    'Miami-Dade',
    '30-22-12-012-2104',
    'CONDO UNIT 2104, BRICKELL AVENUE CONDOMINIUM, ACCORDING TO DECLARATION...',
    'known service address',
    '2025-01-15 00:00:00+00',
    NULL,
    '2025R000123',
    '1234-567',
    NULL,
    450000.00,
    'high',
    'Utility customer database',
    'FPL',
    'condo',
    false,
    true
  ),
  (
    rafael_id,
    'Rafael Vargas',
    ARRAY['Rafael J. Vargas', 'R. Vargas'],
    'rjvargas87@gmail.com',
    '305-555-0198',
    '124 Anchorage Dr N',
    'North Palm Beach',
    'FL',
    '33408',
    'Palm Beach',
    '00424627220000570',
    'LOT 12, BLOCK 8, NORTH PALM BEACH ESTATES, ACCORDING TO PLAT...',
    'recent purchase',
    '2026-06-15 00:00:00+00',
    '2026-06-29 00:00:00+00',
    '2026R000456',
    '7890-123',
    525000.00,
    540000.00,
    'high',
    'Palm Beach County Recorder',
    'FPL',
    'single-family home',
    true,
    false
  );

  -- Insert Emin Mugla property records (Miami-Dade County format)
  INSERT INTO property_records (
    user_id, owner_name, alternate_names, email, phone, address, city, state, zip, county,
    parcel_id, legal_description, event_type, recording_date, closing_date, document_number,
    book_page, sale_price, assessed_value, confidence, source, utility_provider,
    property_type, has_garage, known_property
  ) VALUES
  (
    emin_id,
    'Emin Mugla',
    ARRAY['E. Mugla', 'E.M.'],
    'woarzus@gmail.com',
    '954-666-2333',
    '1450 Brickell Bay Dr, Apt 1402',
    'Miami',
    'FL',
    '33131',
    'Miami-Dade',
    '30-22-14-009-1402',
    'CONDO UNIT 1402, BRICKELL BAY CONDOMINIUM, ACCORDING TO DECLARATION...',
    'known service address',
    '2025-03-20 00:00:00+00',
    NULL,
    '2025R000789',
    '2345-678',
    NULL,
    475000.00,
    'high',
    'Utility customer database',
    'FPL',
    'condo',
    false,
    true
  ),
  (
    emin_id,
    'Emin Mugla',
    ARRAY['E. Mugla', 'E.M.'],
    'woarzus@gmail.com',
    '954-666-2333',
    '320 Anchorage Dr',
    'North Palm Beach',
    'FL',
    '33408',
    'Palm Beach',
    '08434507050000870',
    'LOT 8, BLOCK 15, NORTH PALM BEACH ESTATES, ACCORDING TO PLAT...',
    'recent purchase',
    '2026-06-10 00:00:00+00',
    '2026-06-25 00:00:00+00',
    '2026R000321',
    '8901-234',
    485000.00,
    495000.00,
    'high',
    'Palm Beach County Recorder',
    'FPL',
    'single-family home',
    true,
    false
  );

  -- Insert edge case: customer with no recent events (Miami-Dade format)
  INSERT INTO property_records (
    user_id, owner_name, alternate_names, email, phone, address, city, state, zip, county,
    parcel_id, legal_description, event_type, recording_date, closing_date, document_number,
    book_page, sale_price, assessed_value, confidence, source, utility_provider,
    property_type, has_garage, known_property
  ) VALUES
  (
    rafael_id,
    'Maria Garcia',
    ARRAY['M. Garcia', 'Maria G.'],
    'maria.garcia@example.com',
    '786-555-0123',
    '123 Ocean Dr Apt 5B',
    'Miami Beach',
    'FL',
    '33139',
    'Miami-Dade',
    '30-21-11-005-0005',
    'CONDO UNIT 5B, OCEAN DRIVE CONDOMINIUM, ACCORDING TO DECLARATION...',
    'known service address',
    '2024-01-10 00:00:00+00',
    NULL,
    '2024R000111',
    '3456-789',
    NULL,
    385000.00,
    'high',
    'Utility customer database',
    'FPL',
    'condo',
    false,
    true
  );

  -- Insert edge case: low-confidence name-only match (Palm Beach format)
  INSERT INTO property_records (
    user_id, owner_name, alternate_names, email, phone, address, city, state, zip, county,
    parcel_id, legal_description, event_type, recording_date, closing_date, document_number,
    book_page, sale_price, assessed_value, confidence, source, utility_provider,
    property_type, has_garage, known_property
  ) VALUES
  (
    rafael_id,
    'John Smith',
    ARRAY['J. Smith', 'Johnny Smith'],
    NULL,
    NULL,
    '456 Palm Ave',
    'West Palm Beach',
    'FL',
    '33401',
    'Palm Beach',
    '08434528010000430',
    'LOT 12, BLOCK 3, WEST PALM BEACH SUBDIVISION, ACCORDING TO PLAT...',
    'recent purchase',
    '2026-06-18 00:00:00+00',
    '2026-07-02 00:00:00+00',
    '2026R000555',
    '5678-901',
    415000.00,
    425000.00,
    'low',
    'Palm Beach County Recorder',
    'FPL',
    'single-family home',
    true,
    false
  );

  -- Insert edge case: property outside utility territory (Orange County format)
  INSERT INTO property_records (
    user_id, owner_name, alternate_names, email, phone, address, city, state, zip, county,
    parcel_id, legal_description, event_type, recording_date, closing_date, document_number,
    book_page, sale_price, assessed_value, confidence, source, utility_provider,
    property_type, has_garage, known_property
  ) VALUES
  (
    rafael_id,
    'Sarah Johnson',
    ARRAY['S. Johnson'],
    'sarah.j@example.com',
    '407-555-0987',
    '789 Orange Blossom Trail',
    'Orlando',
    'FL',
    '32801',
    'Orange',
    '21-22-33-044-0789',
    'LOT 44, BLOCK 7, ORANGE BLOSSOM SUBDIVISION, ACCORDING TO PLAT...',
    'recent purchase',
    '2026-06-12 00:00:00+00',
    '2026-06-26 00:00:00+00',
    '2026R000666',
    '6789-012',
    375000.00,
    385000.00,
    'high',
    'Orange County Recorder',
    'Duke Energy',
    'single-family home',
    true,
    false
  );

  -- Insert edge case: property without garage (Miami-Dade format)
  INSERT INTO property_records (
    user_id, owner_name, alternate_names, email, phone, address, city, state, zip, county,
    parcel_id, legal_description, event_type, recording_date, closing_date, document_number,
    book_page, sale_price, assessed_value, confidence, source, utility_provider,
    property_type, has_garage, known_property
  ) VALUES
  (
    rafael_id,
    'David Lee',
    ARRAY['D. Lee'],
    'david.lee@example.com',
    '305-555-0345',
    '321 Collins Ave Apt 8C',
    'Miami Beach',
    'FL',
    '33139',
    'Miami-Dade',
    '30-21-11-008-0321',
    'CONDO UNIT 8C, COLLINS AVENUE CONDOMINIUM, ACCORDING TO DECLARATION...',
    'recent purchase',
    '2026-06-20 00:00:00+00',
    '2026-07-04 00:00:00+00',
    '2026R000777',
    '7890-345',
    395000.00,
    405000.00,
    'high',
    'Miami-Dade County Recorder',
    'FPL',
    'condo',
    false,
    false
  );

  RAISE NOTICE 'Seed data inserted successfully';
END $$;
