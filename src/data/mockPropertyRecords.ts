/**
 * Mock public property records for the property-records-mcp server.
 *
 * All data in this file is synthetic and clearly labeled as mock data.
 * No real public record APIs, county recorders, or title systems are called.
 */

export type PropertyEventType = "recent purchase" | "ownership registration" | "title transfer" | "deed recorded";

export type MatchConfidence = "low" | "medium" | "high";

export type PropertyRecord = {
  id: string;
  owner_name: string;
  alternate_names?: string[];
  email?: string;
  phone?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  event_type: PropertyEventType;
  recording_date: string;
  closing_date?: string;
  confidence: MatchConfidence;
  source: string;
  service_territory: string;
  property_type: string;
  has_garage: boolean;
  ev_suitability_hint: string;
  notes: string;
  known_fpl_property?: boolean;
};

export type CustomerProfile = {
  full_name: string;
  alternate_names: string[];
  email: string;
  phone: string;
  known_fpl_address?: string;
};

export const CUSTOMER_RAFAEL_VARGAS: CustomerProfile = {
  full_name: "Rafael Vargas",
  alternate_names: ["Mr Vargas", "R Vargas", "RJ Vargas"],
  email: "rjvargas87@gmail.com",
  phone: "305-555-0198",
  known_fpl_address: "888 Brickell Ave Apt 2104, Miami, FL 33131"
};

export const MOCK_PROPERTY_RECORDS: PropertyRecord[] = [
  {
    id: "pbc-2026-124-anchorage",
    owner_name: "Rafael Vargas",
    alternate_names: ["Mr Vargas", "R Vargas", "RJ Vargas"],
    email: "rjvargas87@gmail.com",
    phone: "305-555-0198",
    address: "124 Anchorage Dr N",
    city: "North Palm Beach",
    state: "FL",
    zip: "33408",
    county: "Palm Beach County",
    event_type: "recent purchase",
    recording_date: "2026-06-15",
    closing_date: "2026-06-29",
    confidence: "high",
    source: "mock public property record",
    service_territory: "FPL",
    property_type: "single family home",
    has_garage: true,
    ev_suitability_hint: "likely suitable for home EV charging",
    notes: "Newly registered property that may need FPL move-in service."
  },
  {
    id: "mdc-2026-888-brickell",
    owner_name: "Rafael Vargas",
    alternate_names: ["Mr Vargas", "R Vargas", "RJ Vargas"],
    email: "rjvargas87@gmail.com",
    phone: "305-555-0198",
    address: "888 Brickell Ave Apt 2104",
    city: "Miami",
    state: "FL",
    zip: "33131",
    county: "Miami-Dade County",
    event_type: "ownership registration",
    recording_date: "2022-03-10",
    closing_date: "2022-03-24",
    confidence: "high",
    source: "mock public property record",
    service_territory: "FPL",
    property_type: "condominium",
    has_garage: false,
    ev_suitability_hint: "building EV charging may depend on condo association approval",
    notes: "Known existing FPL utility service address. Used as a customer anchor.",
    known_fpl_property: true
  },
  {
    id: "pbc-2026-123-lakeview",
    owner_name: "Alice Cooper",
    alternate_names: [],
    email: "acooper@example.com",
    phone: "561-555-0100",
    address: "123 Lakeview Dr",
    city: "West Palm Beach",
    state: "FL",
    zip: "33401",
    county: "Palm Beach County",
    event_type: "ownership registration",
    recording_date: "2020-01-15",
    closing_date: "2020-01-29",
    confidence: "high",
    source: "mock public property record",
    service_territory: "FPL",
    property_type: "single family home",
    has_garage: true,
    ev_suitability_hint: "likely suitable for home EV charging",
    notes: "Historical record only. No new property events in the last 90 days."
  },
  {
    id: "duval-2026-456-river",
    owner_name: "John Smith",
    alternate_names: [],
    email: "jsmith@example.com",
    phone: "904-555-0200",
    address: "456 River Rd",
    city: "Jacksonville",
    state: "FL",
    zip: "32202",
    county: "Duval County",
    event_type: "recent purchase",
    recording_date: "2026-06-10",
    closing_date: "2026-06-24",
    confidence: "low",
    source: "mock public property record",
    service_territory: "JEA",
    property_type: "townhouse",
    has_garage: true,
    ev_suitability_hint: "outside FPL service territory; EV program eligibility unknown",
    notes: "Name-only match for a common name. Low confidence because email and phone do not match customer profile."
  },
  {
    id: "gpc-2026-789-peachtree",
    owner_name: "Emily Johnson",
    alternate_names: [],
    email: "ejohnson@example.com",
    phone: "404-555-0300",
    address: "789 Peachtree St NE",
    city: "Atlanta",
    state: "GA",
    zip: "30308",
    county: "Fulton County",
    event_type: "recent purchase",
    recording_date: "2026-06-12",
    closing_date: "2026-06-26",
    confidence: "high",
    source: "mock public property record",
    service_territory: "Georgia Power",
    property_type: "mid-rise condominium",
    has_garage: false,
    ev_suitability_hint: "no private garage; public/shared charging may be more practical",
    notes: "Property is outside FPL service territory."
  },
  {
    id: "duke-2026-321-oak",
    owner_name: "Michael Brown",
    alternate_names: [],
    email: "mbrown@example.com",
    phone: "919-555-0400",
    address: "321 Oak St",
    city: "Durham",
    state: "NC",
    zip: "27701",
    county: "Durham County",
    event_type: "recent purchase",
    recording_date: "2026-06-08",
    closing_date: "2026-06-22",
    confidence: "high",
    source: "mock public property record",
    service_territory: "Duke Energy",
    property_type: "single family home",
    has_garage: false,
    ev_suitability_hint: "no garage; driveway charging possible but suboptimal",
    notes: "Outside FPL territory and lacks a garage, so low EV suitability for home charging."
  }
];

export const getMockPropertyRecords = (): PropertyRecord[] => MOCK_PROPERTY_RECORDS;

export const getCustomerProfile = (): CustomerProfile => CUSTOMER_RAFAEL_VARGAS;
