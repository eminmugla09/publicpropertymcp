# property-records-mcp

A standalone MCP server that simulates public property record lookup with mock data. This MCP lets an assistant discover that a customer has recently bought or registered a new property from synthetic public property records.

> All data returned by this server is **mock** public property record data. No real county recorder, title, or property APIs are called. No real customer data is stored.

## Customer scenarios

### Rafael Vargas

- **Customer:** Rafael Vargas (also matched as `Mr Vargas`, `R Vargas`, `RJ Vargas`)
- **Email:** rjvargas87@gmail.com
- **Phone:** 305-555-0198
- **Known FPL property:** 888 Brickell Ave Apt 2104, Miami, FL 33131
- **Recent public property record:** 124 Anchorage Dr N, North Palm Beach, FL 33408
  - Owner: Rafael Vargas
  - Event: recent purchase / ownership registration
  - County: Palm Beach County
  - Recording date: 2026-06-15
  - Closing date: 2026-06-29
  - Service territory: FPL
  - Property type: single family home
  - Has garage: true
  - EV suitability: likely suitable for home EV charging

### Emin Mugla

- **Customer:** Emin Mugla
- **Email:** woarzus@gmail.com
- **Phone:** 954-666-2333
- **Known FPL property:** 1450 Brickell Bay Dr, Apt 1402, Miami, FL 33131
- **Recent public property record:** 320 Anchorage Dr, North Palm Beach, FL 33408
  - Owner: Emin Mugla
  - Event: recent purchase / ownership registration
  - County: Palm Beach County
  - Recording date: 2026-06-15
  - Closing date: 2026-06-29
  - Service territory: FPL
  - Property type: single family home
  - Has garage: true
  - EV suitability: likely suitable for home EV charging

This MCP is separate from the FPL MCP. The FPL MCP knows active FPL accounts, premises, billing, and EV services. The Property Records MCP only knows public property ownership / registration events.

## Run locally

```bash
npm install
npm run build
npm start
```

By default, `npm start` runs the MCP server over **stdio** for local MCP clients. To run the same server as an HTTP service:

```bash
PORT=3000 npm start
# or
MCP_TRANSPORT=http npm start
```

HTTP endpoints:

- `POST /mcp`: stateless Streamable HTTP MCP endpoint
- `GET /health`: health check returning `{ "status": "ok", "mcpPath": "/mcp", "privacyPath": "/privacy" }`
- `GET /privacy`: public privacy notice for ChatGPT connector/app setup

## MCP tools

1. `search_properties_by_owner` — Search mock public property records by owner name, email, or phone.
2. `get_recent_property_events` — Return recent public property events for a customer, ordered by recording date descending.
3. `match_property_to_customer` — Match a public property record to a known customer using name, email, phone, and known addresses.
4. `get_property_record_by_address` — Look up a mock public property record by address.

## Sample tool calls

### `search_properties_by_owner`

Request:

```json
{
  "owner_name": "Rafael Vargas"
}
```

Response (truncated):

```json
{
  "found": true,
  "count": 2,
  "data_source": "mock public property records",
  "records": [
    {
      "owner_name": "Rafael Vargas",
      "address": "124 Anchorage Dr N",
      "city": "North Palm Beach",
      "state": "FL",
      "zip": "33408",
      "county": "Palm Beach County",
      "event_type": "recent purchase",
      "recording_date": "2026-06-15",
      "closing_date": "2026-06-29",
      "confidence": "high",
      "source": "mock public property record",
      "service_territory": "FPL",
      "property_type": "single family home",
      "has_garage": true,
      "ev_suitability_hint": "likely suitable for home EV charging",
      "notes": "Newly registered property that may need FPL move-in service."
    }
  ]
}
```

### `get_recent_property_events`

Request:

```json
{
  "email": "rjvargas87@gmail.com",
  "days_back": 90
}
```

Response:

```json
{
  "found": true,
  "count": 1,
  "data_source": "mock public property records",
  "days_back": 90,
  "reference_date": "2026-06-21",
  "events": [
    {
      "owner_name": "Rafael Vargas",
      "address": "124 Anchorage Dr N",
      "city": "North Palm Beach",
      "state": "FL",
      "zip": "33408",
      "county": "Palm Beach County",
      "event_type": "recent purchase",
      "recording_date": "2026-06-15",
      "closing_date": "2026-06-29",
      "confidence": "high",
      "source": "mock public property record",
      "service_territory": "FPL",
      "property_type": "single family home",
      "has_garage": true,
      "ev_suitability_hint": "likely suitable for home EV charging",
      "notes": "Newly registered property that may need FPL move-in service."
    }
  ]
}
```

### `match_property_to_customer`

Request:

```json
{
  "customer_name": "Rafael Vargas",
  "email": "rjvargas87@gmail.com",
  "phone": "305-555-0198",
  "known_addresses": ["888 Brickell Ave Apt 2104, Miami, FL 33131"]
}
```

Response:

```json
{
  "matched": true,
  "match_confidence": "high",
  "reason": "Owner name Rafael Vargas matches customer profile, the email/phone matches, and the known FPL address anchors the customer. A recent public property record shows 124 Anchorage Dr N in North Palm Beach recorded on 2026-06-15.",
  "matched_property": {
    "address": "124 Anchorage Dr N",
    "city": "North Palm Beach",
    "state": "FL",
    "zip": "33408",
    "county": "Palm Beach County",
    "recording_date": "2026-06-15",
    "closing_date": "2026-06-29",
    "service_territory": "FPL",
    "property_type": "single family home",
    "has_garage": true,
    "ev_suitability_hint": "likely suitable for home EV charging"
  },
  "recommended_next_action": "Ask the customer whether they want to start FPL service at 124 Anchorage Dr N in North Palm Beach on the closing date (2026-06-29)."
}
```

#### Emin Mugla example

Request:

```json
{
  "customer_name": "Emin Mugla",
  "email": "woarzus@gmail.com",
  "phone": "954-666-2333",
  "known_addresses": ["1450 Brickell Bay Dr, Apt 1402, Miami, FL 33131"]
}
```

Response:

```json
{
  "matched": true,
  "match_confidence": "high",
  "reason": "Owner name Emin Mugla matches customer profile, the email/phone matches, and the known FPL address anchors the customer. A recent public property record shows 320 Anchorage Dr in North Palm Beach recorded on 2026-06-15.",
  "matched_property": {
    "address": "320 Anchorage Dr",
    "city": "North Palm Beach",
    "state": "FL",
    "zip": "33408",
    "county": "Palm Beach County",
    "recording_date": "2026-06-15",
    "closing_date": "2026-06-29",
    "service_territory": "FPL",
    "property_type": "single family home",
    "has_garage": true,
    "ev_suitability_hint": "likely suitable for home EV charging"
  },
  "recommended_next_action": "Ask the customer whether they want to start FPL service at 320 Anchorage Dr in North Palm Beach on the closing date (2026-06-29)."
}
```

### `get_property_record_by_address`

Request:

```json
{
  "address": "124 Anchorage Dr N"
}
```

Response:

```json
{
  "found": true,
  "data_source": "mock public property records",
  "record": {
    "owner_name": "Rafael Vargas",
    "address": "124 Anchorage Dr N",
    "city": "North Palm Beach",
    "state": "FL",
    "zip": "33408",
    "county": "Palm Beach County",
    "event_type": "recent purchase",
    "recording_date": "2026-06-15",
    "closing_date": "2026-06-29",
    "confidence": "high",
    "source": "mock public property record",
    "service_territory": "FPL",
    "property_type": "single family home",
    "has_garage": true,
    "ev_suitability_hint": "likely suitable for home EV charging",
    "notes": "Newly registered property that may need FPL move-in service."
  }
}
```

## Demo conversation for Shankar's Tuesday script

**User:** Hi, I want to explore EV services in North Palm Beach.

**Assistant** calls `match_property_to_customer` with the inputs available from the conversation or prior context:

```json
{
  "customer_name": "Rafael Vargas",
  "email": "rjvargas87@gmail.com",
  "phone": "305-555-0198",
  "known_addresses": ["888 Brickell Ave Apt 2104, Miami, FL 33131"]
}
```

**Assistant** responds:

> Hello Mr. Vargas. I'm seeing a recent public property record showing 124 Anchorage Dr N in North Palm Beach registered in your name. Is that the property where you want EV services?

After the customer confirms, the assistant can use the **FPL MCP** to:

- Check the existing Miami FPL account at 888 Brickell Ave.
- Check current EV enrollment.
- Ask whether to keep the Miami service or move out.
- Check EV eligibility for 124 Anchorage Dr N in North Palm Beach.
- Compare EV service / rate options between Miami and North Palm Beach.
- Offer to start service and/or EV enrollment after confirmation.

### Emin Mugla demo conversation

**User:** I want to set up EV charging at my new place in North Palm Beach.

**Assistant** calls `match_property_to_customer`:

```json
{
  "customer_name": "Emin Mugla",
  "email": "woarzus@gmail.com",
  "phone": "954-666-2333",
  "known_addresses": ["1450 Brickell Bay Dr, Apt 1402, Miami, FL 33131"]
}
```

**Assistant** responds:

> Hello Mr. Mugla. I’m seeing a recent public property record showing 320 Anchorage Dr in North Palm Beach registered in your name. Is that the property where you want EV services?

After the customer confirms, the assistant can use the **FPL MCP** to check the existing Miami account at 1450 Brickell Bay Dr and proceed with EV eligibility and enrollment for 320 Anchorage Dr.

## Mock edge cases

The mock data includes these additional records for testing:

- **Customer with no recent property events:** Alice Cooper owns a West Palm Beach property recorded in 2020, so `get_recent_property_events` with `days_back: 90` returns no events.
- **Low-confidence name-only match:** John Smith is a common name with a recent purchase in Jacksonville, matched with low confidence.
- **Property outside FPL territory:** Emily Johnson purchased a condo in Atlanta, GA (Georgia Power territory).
- **Property without garage / low EV suitability:** Michael Brown purchased a home in Durham, NC (Duke Energy territory) with no garage.

## Privacy & data source

This server returns only synthetic mock data. It does not:

- Scrape real property records.
- Connect to real county recorder or title systems.
- Store sensitive real customer data.

Every response includes `data_source: "mock public property records"`.
