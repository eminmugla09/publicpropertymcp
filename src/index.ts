import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  CustomerProfile,
  getCustomerProfiles,
  getMockPropertyRecords,
  PropertyRecord
} from "./data/mockPropertyRecords.js";

const REFERENCE_DATE = new Date("2026-06-21T00:00:00Z");

const normalizeString = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizeAddress = (address: string) =>
  address
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .replace(/,/g, "")
    .trim();

const nameMatches = (ownerName: string, alternateNames: string[], name?: string) => {
  if (!name) return false;
  const normalizedName = normalizeString(name);
  const names = [ownerName, ...alternateNames].map(normalizeString);
  return names.some((n) => n === normalizedName || n.includes(normalizedName) || normalizedName.includes(n));
};

const emailMatches = (recordEmail?: string, email?: string) => {
  if (!email || !recordEmail) return false;
  return normalizeString(recordEmail) === normalizeString(email);
};

const phoneMatches = (recordPhone?: string, phone?: string) => {
  if (!phone || !recordPhone) return false;
  const normalizeDigits = (value: string) => value.replace(/\D/g, "");
  return normalizeDigits(recordPhone) === normalizeDigits(phone);
};

const matchesName = (record: PropertyRecord, name?: string) => nameMatches(record.owner_name, record.alternate_names ?? [], name);
const matchesEmail = (record: PropertyRecord, email?: string) => emailMatches(record.email, email);
const matchesPhone = (record: PropertyRecord, phone?: string) => phoneMatches(record.phone, phone);

const matchesAddress = (record: PropertyRecord, address?: string) => {
  if (!address) return false;
  const needle = normalizeAddress(address);
  const haystack = [
    record.address,
    `${record.address}, ${record.city}, ${record.state} ${record.zip}`,
    `${record.address}, ${record.city}`,
    `${record.city}, ${record.state}`
  ].map(normalizeAddress);
  return haystack.some((h) => h.includes(needle) || needle.includes(h));
};

const matchesKnownAddress = (record: PropertyRecord, address?: string) => {
  if (!address) return false;
  const needle = normalizeAddress(address);
  const haystack = [
    record.address,
    `${record.address}, ${record.city}, ${record.state} ${record.zip}`,
    `${record.address}, ${record.city}`
  ].map(normalizeAddress);
  return haystack.some((h) => h.includes(needle) || needle.includes(h));
};

const matchesRecordFilters = (
  record: PropertyRecord,
  filters: { owner_name?: string; email?: string; phone?: string; city?: string; state?: string }
) => {
  const ownerNameMatches = filters.owner_name && matchesName(record, filters.owner_name);
  const emailFilterMatches = filters.email && matchesEmail(record, filters.email);
  const phoneFilterMatches = filters.phone && matchesPhone(record, filters.phone);
  const cityMatches = !filters.city || normalizeString(record.city) === normalizeString(filters.city);
  const stateMatches = !filters.state || normalizeString(record.state) === normalizeString(filters.state);

  const hasIdentityFilter = filters.owner_name || filters.email || filters.phone;
  const identityMatches = !hasIdentityFilter || ownerNameMatches || emailFilterMatches || phoneFilterMatches;

  return identityMatches && cityMatches && stateMatches;
};

const searchProperties = (filters: {
  owner_name?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
}) => {
  const records = getMockPropertyRecords();
  return records.filter((record) => matchesRecordFilters(record, filters));
};

const getRecentPropertyEvents = (filters: {
  owner_name?: string;
  email?: string;
  phone?: string;
  days_back?: number;
}) => {
  const daysBack = filters.days_back ?? 90;
  const cutoff = new Date(REFERENCE_DATE);
  cutoff.setDate(cutoff.getDate() - daysBack);

  const records = searchProperties({
    owner_name: filters.owner_name,
    email: filters.email,
    phone: filters.phone
  });

  return records
    .filter((record) => new Date(record.recording_date) >= cutoff)
    .sort((a, b) => new Date(b.recording_date).getTime() - new Date(a.recording_date).getTime());
};

const findCustomerProfile = (input: {
  customer_name?: string;
  email?: string;
  phone?: string;
  known_addresses?: string[];
}) => {
  const customers = getCustomerProfiles();
  const records = getMockPropertyRecords();
  const { customer_name, email, phone, known_addresses = [] } = input;

  return customers.find((customer) => {
    const nameMatch = customer_name ? nameMatches(customer.full_name, customer.alternate_names, customer_name) : false;
    const emailMatch = email ? emailMatches(customer.email, email) : false;
    const phoneMatch = phone ? phoneMatches(customer.phone, phone) : false;
    const addressMatch = known_addresses.some((address) =>
      records.some(
        (record) =>
          record.owner_name === customer.full_name &&
          record.known_fpl_property &&
          matchesKnownAddress(record, address)
      )
    );

    return nameMatch || emailMatch || phoneMatch || addressMatch;
  });
};

const matchPropertyToCustomer = (input: {
  customer_name: string;
  email?: string;
  phone?: string;
  known_addresses?: string[];
}) => {
  const records = getMockPropertyRecords();
  const { customer_name, email, phone, known_addresses = [] } = input;

  const customer = findCustomerProfile(input);

  if (!customer) {
    return {
      matched: false,
      match_confidence: "low" as const,
      reason: "No matching customer profile found in mock public property records.",
      matched_property: null,
      recommended_next_action: "Ask the customer for their email, phone, or a known address to anchor the match."
    };
  }

  const knownAddressMatch = known_addresses.some((address) =>
    records.some(
      (record) =>
        record.owner_name === customer.full_name && record.known_fpl_property && matchesKnownAddress(record, address)
    )
  );

  const identitySignals = [
    nameMatches(customer.full_name, customer.alternate_names, customer_name),
    emailMatches(customer.email, email),
    phoneMatches(customer.phone, phone)
  ].filter(Boolean).length;

  const matchedRecord = records.find(
    (record) =>
      record.owner_name === customer.full_name &&
      record.event_type === "recent purchase" &&
      record.service_territory === "FPL" &&
      !record.known_fpl_property
  );

  if (!matchedRecord) {
    return {
      matched: false,
      match_confidence: "low" as const,
      reason: `Customer ${customer.full_name} was found, but no recent mock public property record matches a new property purchase.`,
      matched_property: null,
      recommended_next_action: "Ask the customer for the address of the new property they want EV services for."
    };
  }

  let confidence: "low" | "medium" | "high" = "low";
  let reason = "";
  let action = "";

  if (identitySignals >= 2 && knownAddressMatch) {
    confidence = "high";
    reason = `Owner name ${customer.full_name} matches customer profile, the email/phone matches, and the known FPL address anchors the customer. A recent public property record shows ${matchedRecord.address} in ${matchedRecord.city} recorded on ${matchedRecord.recording_date}.`;
    action = `Ask the customer whether they want to start FPL service at ${matchedRecord.address} in ${matchedRecord.city} on the closing date (${matchedRecord.closing_date}).`;
  } else if (identitySignals >= 2) {
    confidence = "high";
    reason = `Owner name ${customer.full_name} matches customer profile and the email/phone matches. A recent public property record shows ${matchedRecord.address} in ${matchedRecord.city} recorded on ${matchedRecord.recording_date}.`;
    action = `Confirm the new ${matchedRecord.city} property and ask whether the customer wants FPL service started there on ${matchedRecord.closing_date}.`;
  } else if (knownAddressMatch) {
    confidence = "high";
    reason = `The known FPL address anchors the customer to the profile, and a recent public property record shows ${matchedRecord.address} in ${matchedRecord.city} recorded on ${matchedRecord.recording_date}.`;
    action = `Ask the customer whether ${matchedRecord.address} is their new property and whether to start FPL service there on ${matchedRecord.closing_date}.`;
  } else if (identitySignals === 1) {
    confidence = "medium";
    reason = `One identifying signal matches the customer profile. A recent public property record shows ${matchedRecord.address} in ${matchedRecord.city} recorded on ${matchedRecord.recording_date}.`;
    action = `Verify the customer's email, phone, or a known address before relying on the match.`;
  } else {
    confidence = "low";
    reason = "Only weak or no identifying signals match the customer profile.";
    action = "Ask the customer for additional identifying information before relying on the match.";
  }

  return {
    matched: true,
    match_confidence: confidence,
    reason,
    matched_property: {
      address: matchedRecord.address,
      city: matchedRecord.city,
      state: matchedRecord.state,
      zip: matchedRecord.zip,
      county: matchedRecord.county,
      recording_date: matchedRecord.recording_date,
      closing_date: matchedRecord.closing_date,
      service_territory: matchedRecord.service_territory,
      property_type: matchedRecord.property_type,
      has_garage: matchedRecord.has_garage,
      ev_suitability_hint: matchedRecord.ev_suitability_hint
    },
    recommended_next_action: action
  };
};

const getPropertyRecordByAddress = (address: string) => {
  const records = getMockPropertyRecords();
  const normalized = normalizeAddress(address);

  return (
    records.find(
      (record) =>
        normalizeAddress(record.address).includes(normalized) ||
        normalized.includes(normalizeAddress(record.address)) ||
        normalizeAddress(`${record.address}, ${record.city}, ${record.state} ${record.zip}`).includes(normalized)
    ) ?? null
  );
};

const jsonContent = (payload: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(payload, null, 2)
    }
  ]
});

const toRecordOutput = (record: PropertyRecord) => ({
  owner_name: record.owner_name,
  address: record.address,
  city: record.city,
  state: record.state,
  zip: record.zip,
  county: record.county,
  event_type: record.event_type,
  recording_date: record.recording_date,
  closing_date: record.closing_date,
  confidence: record.confidence,
  source: record.source,
  service_territory: record.service_territory,
  property_type: record.property_type,
  has_garage: record.has_garage,
  ev_suitability_hint: record.ev_suitability_hint,
  notes: record.notes
});

const createPropertyRecordsMcpServer = () => {
  const server = new McpServer(
    {
      name: "property-records-mcp",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {
          listChanged: true
        }
      }
    }
  );

  server.registerTool(
    "search_properties_by_owner",
    {
      description:
        "Search mock public property records by owner name, email, or phone. Returns matching property records with ownership, recording, and EV suitability details. All data is synthetic mock data.",
      inputSchema: {
        owner_name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional()
      }
    },
    async (args) => {
      const matches = searchProperties(args);
      return jsonContent({
        found: matches.length > 0,
        count: matches.length,
        data_source: "mock public property records",
        records: matches.map(toRecordOutput)
      });
    }
  );

  server.registerTool(
    "get_recent_property_events",
    {
      description:
        "Return recent public property events for a customer, ordered by recording date descending. All data is synthetic mock data.",
      inputSchema: {
        owner_name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        days_back: z.number().optional()
      }
    },
    async (args) => {
      const events = getRecentPropertyEvents(args);
      return jsonContent({
        found: events.length > 0,
        count: events.length,
        data_source: "mock public property records",
        days_back: args.days_back ?? 90,
        reference_date: REFERENCE_DATE.toISOString().split("T")[0],
        events: events.map(toRecordOutput)
      });
    }
  );

  server.registerTool(
    "match_property_to_customer",
    {
      description:
        "Match a public property record to a known customer using name, email, phone, and known addresses. Simulates a 'new home discovered' event from mock public property records.",
      inputSchema: {
        customer_name: z.string(),
        email: z.string().optional(),
        phone: z.string().optional(),
        known_addresses: z.array(z.string()).optional()
      }
    },
    async (args) => jsonContent(matchPropertyToCustomer(args))
  );

  server.registerTool(
    "get_property_record_by_address",
    {
      description:
        "Look up a mock public property record by address. Returns the matching record or a not-found response.",
      inputSchema: {
        address: z.string()
      }
    },
    async ({ address }) => {
      const record = getPropertyRecordByAddress(address);
      return jsonContent(
        record
          ? {
              found: true,
              data_source: "mock public property records",
              record: toRecordOutput(record)
            }
          : {
              found: false,
              data_source: "mock public property records",
              message: "No matching property record found for the given address."
            }
      );
    }
  );

  return server;
};

const mcpServer = createPropertyRecordsMcpServer();

const readRequestBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const setCorsHeaders = (response: ServerResponse) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, mcp-session-id");
  response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, mcp-session-id");
};

const writeJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  setCorsHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
};

const writeHtml = (response: ServerResponse, statusCode: number, html: string) => {
  setCorsHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
};

const privacyPageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Property Records MCP Privacy Notice</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.5; max-width: 760px; margin: 40px auto; padding: 0 20px; color: #1f2933; }
      h1, h2 { color: #102a43; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Property Records MCP Privacy Notice</h1>
    <p>Last updated: 2026-06-21</p>
    <p>This service provides mock public property record lookup tools for an AI assistant demo. It is not a production service and does not connect to real county recorder, title, appraisal, or property search systems.</p>

    <h2>Data Used</h2>
    <p>All records returned by the MCP tools are synthetic mock data bundled with the application. The data is invented and clearly labeled as <code>mock public property records</code> in every response.</p>

    <h2>No Real APIs</h2>
    <p>This server does not call real public record APIs, scrape live property records, or store sensitive real customer data. The customer profile and addresses used are part of the demo scenario only.</p>

    <h2>Contact</h2>
    <p>For questions about this demo, contact the developer maintaining this repository.</p>
  </body>
</html>`;

const handleMcpRequest = async (request: IncomingMessage, response: ServerResponse) => {
  if (request.method === "OPTIONS") {
    setCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    writeJson(response, 405, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST /mcp for this stateless MCP endpoint."
      },
      id: null
    });
    return;
  }

  const acceptHeader = request.headers.accept;
  if (!acceptHeader || !acceptHeader.includes("application/json") || !acceptHeader.includes("text/event-stream")) {
    request.headers.accept = "application/json, text/event-stream";
  }

  const body = await readRequestBody(request);
  console.log(`[${new Date().toISOString()}] Request body:`, JSON.stringify(body, null, 2));

  if (body?.method === "initialize") {
    console.log(`[${new Date().toISOString()}] Handling initialize request`);
    const initResponse = {
      jsonrpc: "2.0",
      id: body.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: { listChanged: true }
        },
        serverInfo: {
          name: "property-records-mcp",
          version: "0.1.0"
        }
      }
    };
    setCorsHeaders(response);
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(`event: message\ndata: ${JSON.stringify(initResponse)}\n\n`);
    response.end();
    return;
  }

  if (body?.method === "tools/list") {
    console.log(`[${new Date().toISOString()}] Handling tools/list request`);
    const tools = [
      {
        name: "search_properties_by_owner",
        description:
          "Search mock public property records by owner name, email, or phone. Returns matching property records with ownership, recording, and EV suitability details. All data is synthetic mock data.",
        inputSchema: {
          type: "object",
          properties: {
            owner_name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            city: { type: "string" },
            state: { type: "string" }
          },
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#"
        }
      },
      {
        name: "get_recent_property_events",
        description:
          "Return recent public property events for a customer, ordered by recording date descending. All data is synthetic mock data.",
        inputSchema: {
          type: "object",
          properties: {
            owner_name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            days_back: { type: "number" }
          },
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#"
        }
      },
      {
        name: "match_property_to_customer",
        description:
          "Match a public property record to a known customer using name, email, phone, and known addresses. Simulates a 'new home discovered' event from mock public property records.",
        inputSchema: {
          type: "object",
          properties: {
            customer_name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            known_addresses: { type: "array", items: { type: "string" } }
          },
          required: ["customer_name"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#"
        }
      },
      {
        name: "get_property_record_by_address",
        description:
          "Look up a mock public property record by address. Returns the matching record or a not-found response.",
        inputSchema: {
          type: "object",
          properties: {
            address: { type: "string" }
          },
          required: ["address"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#"
        }
      }
    ];

    const toolsResponse = {
      jsonrpc: "2.0",
      id: body.id,
      result: { tools }
    };
    setCorsHeaders(response);
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(`event: message\ndata: ${JSON.stringify(toolsResponse)}\n\n`);
    response.end();
    return;
  }

  console.log(`[${new Date().toISOString()}] Handling tool call request: ${body?.method}`);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response, body);
    console.log(`[${new Date().toISOString()}] Request handled successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error handling MCP request:`, error);

    if (!response.headersSent) {
      writeJson(response, 500, {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
      });
    }
  } finally {
    await transport.close();
  }
};

const startHttpServer = () => {
  const port = Number(process.env.PORT ?? 3000);

  createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    console.log(`[${new Date().toISOString()}] HTTP ${request.method} ${url.pathname}`);

    if (url.pathname === "/health") {
      console.log(`[${new Date().toISOString()}] Health check requested`);
      writeJson(response, 200, { status: "ok", mcpPath: "/mcp", privacyPath: "/privacy" });
      return;
    }

    if (url.pathname === "/privacy") {
      console.log(`[${new Date().toISOString()}] Privacy page requested`);
      writeHtml(response, 200, privacyPageHtml);
      return;
    }

    if (url.pathname === "/mcp") {
      await handleMcpRequest(request, response);
      return;
    }

    console.log(`[${new Date().toISOString()}] 404 Not found: ${url.pathname}`);
    writeJson(response, 404, { error: "Not found", mcpPath: "/mcp", healthPath: "/health", privacyPath: "/privacy" });
  }).listen(port, "0.0.0.0", () => {
    console.log(`[${new Date().toISOString()}] Property Records MCP HTTP server listening on port ${port}; endpoint: /mcp`);
  });
};

const startStdioServer = async () => {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
};

if (process.env.MCP_TRANSPORT === "http" || process.env.PORT) {
  startHttpServer();
} else {
  await startStdioServer();
}
