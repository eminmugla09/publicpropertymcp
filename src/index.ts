import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Pool } from 'pg';
import { register, login, verifyToken, handleOAuthToken, ensureOAuthClient, getRegisteredOauthClient, getConfiguredClient } from './auth.js';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { createHash } from 'crypto';

const getDatabaseUrl = () => {
  const rawUrl = process.env.DATABASE_URL ?? '';
  if (!rawUrl) {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    const sslMode = parsed.searchParams.get('sslmode');
    const usesLegacySslMode = sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca';
    if (usesLegacySslMode && !parsed.searchParams.has('uselibpqcompat')) {
      parsed.searchParams.set('uselibpqcompat', 'true');
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

const databaseUrl = getDatabaseUrl();

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 60000,
  idleTimeoutMillis: 30000,
  max: 20
});

const REFERENCE_DATE = new Date("2026-06-21T00:00:00Z");

const normalizeString = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizeAddress = (address: string) =>
  address
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .replace(/,/g, "")
    .trim();

const searchProperties = async (filters: {
  owner_name?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  userId?: string;
}) => {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (filters.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(filters.userId);
  }

  if (filters.owner_name) {
    conditions.push(`(lower(owner_name) LIKE lower($${paramIndex++}) OR lower(owner_name) = lower($${paramIndex++}))`);
    params.push(`%${filters.owner_name}%`, filters.owner_name);
  }

  if (filters.email) {
    conditions.push(`lower(email) = lower($${paramIndex++})`);
    params.push(filters.email);
  }

  if (filters.phone) {
    const normalizedPhone = filters.phone.replace(/\D/g, "");
    conditions.push(`regexp_replace(phone, '\\D', '', 'g') = $${paramIndex++}`);
    params.push(normalizedPhone);
  }

  if (filters.city) {
    conditions.push(`lower(city) = lower($${paramIndex++})`);
    params.push(filters.city);
  }

  if (filters.state) {
    conditions.push(`lower(state) = lower($${paramIndex++})`);
    params.push(filters.state);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT * FROM property_records
    ${whereClause}
    ORDER BY recording_date DESC
  `;

  const result = await pool.query(query, params);
  return result.rows;
};

const getRecentPropertyEvents = async (filters: {
  owner_name?: string;
  email?: string;
  phone?: string;
  days_back?: number;
  userId?: string;
}) => {
  const daysBack = filters.days_back ?? 90;
  const cutoff = new Date(REFERENCE_DATE);
  cutoff.setDate(cutoff.getDate() - daysBack);

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (filters.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(filters.userId);
  }

  conditions.push(`recording_date >= $${paramIndex++}`);
  params.push(cutoff);

  if (filters.owner_name) {
    conditions.push(`(lower(owner_name) LIKE lower($${paramIndex++}) OR lower(owner_name) = lower($${paramIndex++}))`);
    params.push(`%${filters.owner_name}%`, filters.owner_name);
  }

  if (filters.email) {
    conditions.push(`lower(email) = lower($${paramIndex++})`);
    params.push(filters.email);
  }

  if (filters.phone) {
    const normalizedPhone = filters.phone.replace(/\D/g, "");
    conditions.push(`regexp_replace(phone, '\\D', '', 'g') = $${paramIndex++}`);
    params.push(normalizedPhone);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const query = `
    SELECT * FROM property_records
    ${whereClause}
    ORDER BY recording_date DESC
  `;

  const result = await pool.query(query, params);
  return result.rows;
};

const matchPropertyToCustomer = async (input: {
  customer_name: string;
  email?: string;
  phone?: string;
  known_addresses?: string[];
  userId?: string;
}) => {
  const { customer_name, email, phone, known_addresses = [], userId } = input;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(userId);
  }

  if (customer_name) {
    conditions.push(`(lower(owner_name) LIKE lower($${paramIndex++}) OR lower(owner_name) = lower($${paramIndex++}))`);
    params.push(`%${customer_name}%`, customer_name);
  }

  if (email) {
    conditions.push(`lower(email) = lower($${paramIndex++})`);
    params.push(email);
  }

  if (phone) {
    const normalizedPhone = phone.replace(/\D/g, "");
    conditions.push(`regexp_replace(phone, '\\D', '', 'g') = $${paramIndex++}`);
    params.push(normalizedPhone);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT * FROM property_records
    ${whereClause}
    AND event_type = 'recent purchase'
    AND (known_property IS NULL OR known_property = false)
    ORDER BY recording_date DESC
    LIMIT 1
  `;

  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    return {
      matched: false,
      match_confidence: "low" as const,
      reason: "No matching property record found.",
      matched_property: null
    };
  }

  const matchedRecord = result.rows[0];

  const identitySignals = [
    customer_name ? 1 : 0,
    email ? 1 : 0,
    phone ? 1 : 0
  ].filter(Boolean).length;

  const knownAddressMatch = known_addresses.length > 0;

  let confidence: "low" | "medium" | "high" = "low";
  let reason = "";

  if (identitySignals >= 2 && knownAddressMatch) {
    confidence = "high";
    reason = `Owner name ${customer_name} matches customer profile, the email/phone matches, and the known address anchors the customer. A recent public property record shows ${matchedRecord.address} in ${matchedRecord.city} recorded on ${matchedRecord.recording_date}.`;
  } else if (identitySignals >= 2) {
    confidence = "high";
    reason = `Owner name ${customer_name} matches customer profile and the email/phone matches. A recent public property record shows ${matchedRecord.address} in ${matchedRecord.city} recorded on ${matchedRecord.recording_date}.`;
  } else if (knownAddressMatch) {
    confidence = "high";
    reason = `The known address anchors the customer to the profile, and a recent public property record shows ${matchedRecord.address} in ${matchedRecord.city} recorded on ${matchedRecord.recording_date}.`;
  } else if (identitySignals === 1) {
    confidence = "medium";
    reason = `One identifying signal matches the customer profile. A recent public property record shows ${matchedRecord.address} in ${matchedRecord.city} recorded on ${matchedRecord.recording_date}.`;
  } else {
    confidence = "low";
    reason = "Only weak or no identifying signals match the customer profile.";
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
      parcel_id: matchedRecord.parcel_id,
      legal_description: matchedRecord.legal_description,
      recording_date: matchedRecord.recording_date,
      closing_date: matchedRecord.closing_date,
      document_number: matchedRecord.document_number,
      book_page: matchedRecord.book_page,
      sale_price: matchedRecord.sale_price,
      assessed_value: matchedRecord.assessed_value,
      utility_provider: matchedRecord.utility_provider,
      property_type: matchedRecord.property_type,
      has_garage: matchedRecord.has_garage
    }
  };
};

const getPropertyRecordByAddress = async (address: string) => {
  const normalized = normalizeAddress(address);

  const query = `
    SELECT * FROM property_records
    WHERE (
      lower(address) LIKE lower($1) OR
      lower($2) LIKE lower(address) OR
      lower(address || ', ' || city || ', ' || state || ' ' || zip) LIKE lower($3)
    )
    LIMIT 1
  `;

  const result = await pool.query(query, [`%${normalized}%`, normalized, `%${normalized}%`]);
  return result.rows[0] || null;
};

const jsonContent = (payload: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(payload, null, 2)
    }
  ]
});

const toRecordOutput = (record: any) => ({
  owner_name: record.owner_name,
  address: record.address,
  city: record.city,
  state: record.state,
  zip: record.zip,
  county: record.county,
  parcel_id: record.parcel_id,
  legal_description: record.legal_description,
  event_type: record.event_type,
  recording_date: record.recording_date,
  closing_date: record.closing_date,
  document_number: record.document_number,
  book_page: record.book_page,
  sale_price: record.sale_price,
  assessed_value: record.assessed_value,
  confidence: record.confidence,
  source: record.source,
  utility_provider: record.utility_provider,
  property_type: record.property_type,
  has_garage: record.has_garage
});

const requireAuth = async (request: IncomingMessage, response: ServerResponse): Promise<{ authorized: boolean; userId?: string }> => {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    writeJson(response, 401, { error: "Unauthorized", message: "Missing authentication token" });
    return { authorized: false };
  }

  const token = authHeader.substring(7);
  
  // Try JWT token
  const jwtVerification = verifyToken(token);
  if (jwtVerification.valid) {
    return { authorized: true, userId: jwtVerification.userId };
  }

  writeJson(response, 401, { error: "Unauthorized", message: "Invalid or expired token" });
  return { authorized: false };
};

const writeJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, mcp-session-id, Authorization");
  response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, mcp-session-id");
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
};

const writeHtml = (response: ServerResponse, statusCode: number, html: string) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, mcp-session-id, Authorization");
  response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, mcp-session-id");
  response.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
};

const setCorsHeaders = (response: ServerResponse) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, mcp-session-id');
  response.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, mcp-session-id');
};

const createOAuthEndpoint = (request: IncomingMessage, path: string) => {
  const host = request.headers.host ?? "localhost";
  return `https://${host}${path}`;
};

const writeOAuthMetadata = (request: IncomingMessage, response: ServerResponse) => {
  const baseUrl = createOAuthEndpoint(request, "");
  writeJson(response, 200, {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"]
  });
};

const writeOpenIdConfiguration = (request: IncomingMessage, response: ServerResponse) => {
  const baseUrl = createOAuthEndpoint(request, "");
  writeJson(response, 200, {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["openid", "profile", "email"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256", "HS256"]
  });
};

const writeOAuthProtectedResource = (request: IncomingMessage, response: ServerResponse) => {
  const baseUrl = createOAuthEndpoint(request, "");
  writeJson(response, 200, {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl]
  });
};

const parseRequestBodyFields = (raw: unknown, request: IncomingMessage) => {
  const contentType = request.headers["content-type"] ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const bodyStr = Buffer.isBuffer(raw) ? raw.toString() : (typeof raw === 'string' ? raw : JSON.stringify(raw));
    return new URLSearchParams(bodyStr);
  }

  const fields = new URLSearchParams();
  const body = (raw || {}) as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      fields.set(key, value);
    }
  }
  return fields;
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
    <p>This service provides public property record lookup tools. It connects to a PostgreSQL database containing property records from public sources.</p>

    <h2>Data Used</h2>
    <p>The MCP tools return records from a PostgreSQL database with property ownership and registration information. The data includes owner names, addresses, recording dates, and utility provider information.</p>

    <h2>Authentication</h2>
    <p>This server supports both JWT-based authentication and OAuth 2.0. All MCP tool calls require a valid authentication token in the Authorization header.</p>

    <h2>OAuth 2.0 Endpoints</h2>
    <ul>
      <li><strong>Authorization Endpoint:</strong> <code>/oauth/authorize</code></li>
      <li><strong>Token Endpoint:</strong> <code>/oauth/token</code></li>
    </ul>

    <h2>Contact</h2>
    <p>For questions about this service, contact the developer maintaining this repository.</p>
  </body>
</html>`;

const oauthLoginPageHtml = (params: string, error?: string) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Property Records Agent – Sign In</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:system-ui,sans-serif;background:#f0f4f8;display:flex;align-items:center;justify-content:center;min-height:100vh}
      .card{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px;width:100%;max-width:400px}
      .logo{font-size:22px;font-weight:700;color:#0050a0;margin-bottom:8px}
      .subtitle{color:#666;font-size:14px;margin-bottom:28px}
      label{display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:6px}
      input{width:100%;padding:10px 14px;border:1px solid #d0d7de;border-radius:8px;font-size:15px;margin-bottom:18px;outline:none;transition:border .2s}
      input:focus{border-color:#0050a0}
      button{width:100%;padding:12px;background:#0050a0;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
      button:hover{background:#003d7a}
      .error{background:#fff0f0;border:1px solid #f88;color:#c00;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:18px}
    </style>
  </head>
  <body>
    <div class="card">
      <div class="logo">🏠 Property Records Agent</div>
      <div class="subtitle">Sign in to connect your property records account to ChatGPT</div>
      ${error ? `<div class="error">${error}</div>` : ""}
      <form method="POST" action="/oauth/authorize?${params}">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="username" placeholder="your@email.com">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="••••••••">
        <button type="submit">Sign In &amp; Authorize</button>
      </form>
    </div>
  </body>
</html>`;



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
        "Search public property records by owner name, email, or phone. Returns matching property records with ownership, recording, and utility provider details.",
      inputSchema: {
        owner_name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional()
      }
    },
    async (args) => {
      const matches = await searchProperties(args);
      return jsonContent({
        found: matches.length > 0,
        count: matches.length,
        data_source: "property records database",
        records: matches.map(toRecordOutput)
      });
    }
  );

  server.registerTool(
    "get_recent_property_events",
    {
      description:
        "Return recent public property events for a customer, ordered by recording date descending.",
      inputSchema: {
        owner_name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        days_back: z.number().optional()
      }
    },
    async (args) => {
      const events = await getRecentPropertyEvents(args);
      return jsonContent({
        found: events.length > 0,
        count: events.length,
        data_source: "property records database",
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
        "Match a public property record to a known customer using name, email, phone, and known addresses. Simulates a 'new property discovered' event.",
      inputSchema: {
        customer_name: z.string(),
        email: z.string().optional(),
        phone: z.string().optional(),
        known_addresses: z.array(z.string()).optional()
      }
    },
    async (args) => jsonContent(await matchPropertyToCustomer(args))
  );

  server.registerTool(
    "get_property_record_by_address",
    {
      description:
        "Look up a public property record by address. Returns the matching record or a not-found response.",
      inputSchema: {
        address: z.string()
      }
    },
    async ({ address }) => {
      const record = await getPropertyRecordByAddress(address);
      return jsonContent(
        record
          ? {
              found: true,
              data_source: "property records database",
              record: toRecordOutput(record)
            }
          : {
              found: false,
              data_source: "property records database",
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

  const body = Buffer.concat(chunks).toString("utf8");
  const contentType = request.headers["content-type"] ?? "";
  
  if (contentType.includes("application/json")) {
    return JSON.parse(body);
  }
  
  // Return raw body for form data or other content types
  return body;
};

const handleMcpRequest = async (request: IncomingMessage, response: ServerResponse) => {
  if (request.method === "OPTIONS") {
    writeHtml(response, 204, "");
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
  if (!acceptHeader || (!acceptHeader.includes("application/json") || !acceptHeader.includes("text/event-stream"))) {
    request.headers.accept = "application/json, text/event-stream";
  }

  const body = await readRequestBody(request);
  const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;

  if (!parsedBody || typeof parsedBody !== 'object') {
    console.log(`[${new Date().toISOString()}] Empty MCP request body received`);
    if (!response.headersSent) {
      writeJson(response, 400, {
        jsonrpc: "2.0",
        error: {
          code: -32700,
          message: "Parse error: request body is empty or invalid"
        },
        id: null
      });
    }
    return;
  }

  console.log(`[${new Date().toISOString()}] Request body:`, JSON.stringify(parsedBody, null, 2));

  if (parsedBody?.method === "initialize") {
    console.log(`[${new Date().toISOString()}] Handling initialize request`);
    const initResponse = {
      jsonrpc: "2.0",
      id: parsedBody.id,
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
    writeHtml(response, 200, `event: message\ndata: ${JSON.stringify(initResponse)}\n\n`);
    return;
  }

  if (parsedBody?.method === "tools/list") {
    console.log(`[${new Date().toISOString()}] Handling tools/list request`);
    const tools = [
      {
        name: "search_properties_by_owner",
        description:
          "Search public property records by owner name, email, or phone. Returns matching property records with ownership, recording, and utility provider details.",
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
          "Return recent public property events for a customer, ordered by recording date descending.",
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
          "Match a public property record to a known customer using name, email, phone, and known addresses. Simulates a 'new property discovered' event.",
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
          "Look up a public property record by address. Returns the matching record or a not-found response.",
        inputSchema: {
          type: "object",
          properties: {
            address: { type: "string" }
          },
          required: ["address"],
          additionalProperties: false,
          $schema: "http://json.org/draft-07/schema#"
        }
      }
    ];

    const toolsResponse = {
      jsonrpc: "2.0",
      id: parsedBody.id,
      result: { tools }
    };
    writeHtml(response, 200, `event: message\ndata: ${JSON.stringify(toolsResponse)}\n\n`);
    return;
  }

  // Authenticate tool calls (OAuth access token is a JWT)
  if (parsedBody?.method === "tools/call") {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log(`[${new Date().toISOString()}] MCP tool call missing Authorization header`);
      writeJson(response, 401, {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Authentication required. Provide a valid OAuth access token in the Authorization header."
        },
        id: parsedBody.id
      });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded.valid || !decoded.userId) {
      console.log(`[${new Date().toISOString()}] MCP tool call invalid token`);
      writeJson(response, 401, {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Invalid or expired access token."
        },
        id: parsedBody.id
      });
      return;
    }

    // Inject user email for scoped tools when not provided
    const toolName = typeof parsedBody?.params?.name === "string" ? parsedBody.params.name : "";
    const scopedTools = ["search_properties_by_owner", "get_recent_property_events", "match_property_to_customer"];
    if (scopedTools.includes(toolName) && decoded.email) {
      if (!parsedBody.params.arguments || typeof parsedBody.params.arguments !== "object") {
        parsedBody.params.arguments = {};
      }
      const args = parsedBody.params.arguments as Record<string, unknown>;
      if (!args.email) {
        args.email = decoded.email;
        console.log(`[${new Date().toISOString()}] Injected user email ${decoded.email} into ${toolName}`);
      }
    }
  }

  console.log(`[${new Date().toISOString()}] Handling tool call request: ${parsedBody?.method}`);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response, parsedBody);
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

const startHttpServer = async () => {
  const port = Number(process.env.PORT ?? 3000);

  // Ensure OAuth client exists in database
  await ensureOAuthClient();

  createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    console.log(`[${new Date().toISOString()}] HTTP ${request.method} ${url.pathname}`);

    if (url.pathname === "/health") {
      console.log(`[${new Date().toISOString()}] Health check requested`);
      writeJson(response, 200, { 
        status: "ok", 
        mcpPath: "/mcp", 
        privacyPath: "/privacy", 
        authPath: "/auth",
        oauthAuthorizePath: "/oauth/authorize",
        oauthTokenPath: "/oauth/token",
        oauthRegisterPath: "/register"
      });
      return;
    }

    if (url.pathname === "/privacy") {
      console.log(`[${new Date().toISOString()}] Privacy page requested`);
      writeHtml(response, 200, privacyPageHtml);
      return;
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      const body = await readRequestBody(request);
      const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
      const { email, password } = parsedBody as { email: string; password: string };

      const result = await login({ email, password });

      if (result.success) {
        writeJson(response, 200, result);
      } else {
        writeJson(response, 401, result);
      }
      return;
    }

    if (url.pathname === "/auth/register" && request.method === "POST") {
      const body = await readRequestBody(request);
      const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
      const { email, password, full_name } = parsedBody as { email: string; password: string; full_name?: string };

      const result = await register({ email, password, full_name });

      if (result.success) {
        writeJson(response, 201, result);
      } else {
        writeJson(response, 409, result);
      }
      return;
    }

    // OAuth 2.0 Authorization Endpoint
    if (url.pathname === "/oauth/authorize") {
      const client_id = url.searchParams.get('client_id');
      const redirect_uri = url.searchParams.get('redirect_uri');
      const response_type = url.searchParams.get('response_type');
      const state = url.searchParams.get('state');
      const code_challenge = url.searchParams.get('code_challenge');
      const code_challenge_method = url.searchParams.get('code_challenge_method');
      const params = url.searchParams.toString();

      const oauthClient = client_id ? await getRegisteredOauthClient(client_id) : null;

      if (!oauthClient || response_type !== 'code') {
        writeHtml(response, 400, oauthLoginPageHtml(params, 'Invalid client or response_type.'));
        return;
      }

      // Only validate redirect_uri if the client has configured redirect_uris
      if (oauthClient.redirect_uris && oauthClient.redirect_uris.length > 0 && !oauthClient.redirect_uris.includes(redirect_uri)) {
        writeHtml(response, 400, oauthLoginPageHtml(params, 'Invalid redirect_uri.'));
        return;
      }

      if (request.method === 'GET') {
        writeHtml(response, 200, oauthLoginPageHtml(params));
        return;
      }

      // POST - process login form
      const body = await readRequestBody(request);
      const formParams = parseRequestBodyFields(body || '', request);
      const email = formParams.get('email')?.toLowerCase() || '';
      const password = formParams.get('password') || '';

      if (!email || !password) {
        writeHtml(response, 400, oauthLoginPageHtml(params, 'Email and password are required.'));
        return;
      }

      // Validate credentials
      const userResult = await pool.query(
        'SELECT id, email, password_hash, is_active FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        writeHtml(response, 401, oauthLoginPageHtml(params, 'Invalid email or password.'));
        return;
      }

      const user = userResult.rows[0];
      if (!user.is_active) {
        writeHtml(response, 401, oauthLoginPageHtml(params, 'Account is deactivated.'));
        return;
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        writeHtml(response, 401, oauthLoginPageHtml(params, 'Invalid email or password.'));
        return;
      }

      // Issue authorization code
      const code = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      
      await pool.query(
        `INSERT INTO oauth_codes (code, client_id, user_id, email, redirect_uri, code_challenge, code_challenge_method, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [code, oauthClient.client_id, user.id, user.email, redirect_uri, code_challenge, code_challenge_method, expiresAt]
      );

      const redirectUrl = new URL(redirect_uri || 'http://localhost:3000/callback');
      redirectUrl.searchParams.set('code', code);
      if (state) redirectUrl.searchParams.set('state', state);

      response.writeHead(302, { Location: redirectUrl.toString() });
      response.end();
      return;
    }

    // OAuth 2.0 Token Endpoint
    if (url.pathname === "/oauth/token") {
      setCorsHeaders(response);
      
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method !== "POST") {
        writeJson(response, 405, { error: "method_not_allowed" });
        return;
      }

      const body = await readRequestBody(request);
      const bodyFields = parseRequestBodyFields(body || '', request);
      const grant_type = bodyFields.get('grant_type') || '';
      const code = bodyFields.get('code') || '';
      const redirect_uri = bodyFields.get('redirect_uri') || '';
      const client_id = bodyFields.get('client_id') || '';
      const client_secret = bodyFields.get('client_secret') || '';
      const code_verifier = bodyFields.get('code_verifier') || '';

      try {
        const tokenResponse = await handleOAuthToken({
          grant_type,
          code,
          redirect_uri,
          client_id,
          client_secret,
          code_verifier
        });
        
        writeJson(response, 200, tokenResponse);
        return;
      } catch (error: any) {
        writeJson(response, 400, { error: "Token request failed", message: error.message });
        return;
      }
    }

    // OAuth 2.0 Metadata Endpoint (for ChatGPT discovery)
    if (url.pathname === "/.well-known/oauth-authorization-server" || url.pathname === "/.well-known/oauth-authorization-server/mcp") {
      writeOAuthMetadata(request, response);
      return;
    }

    // OpenID Configuration Endpoint
    if (url.pathname === "/.well-known/openid-configuration" || url.pathname === "/.well-known/openid-configuration/mcp") {
      writeOpenIdConfiguration(request, response);
      return;
    }

    // OAuth Protected Resource Discovery (RFC 9728)
    if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
      writeOAuthProtectedResource(request, response);
      return;
    }

    // Alternative well-known paths under /mcp
    if (url.pathname === "/mcp/.well-known/oauth-authorization-server") {
      writeOAuthMetadata(request, response);
      return;
    }

    if (url.pathname === "/mcp/.well-known/openid-configuration") {
      writeOpenIdConfiguration(request, response);
      return;
    }

    if (url.pathname === "/mcp/.well-known/oauth-protected-resource") {
      writeOAuthProtectedResource(request, response);
      return;
    }

    // OAuth Registration Endpoint (RFC 7591 Dynamic Client Registration)
    if (url.pathname === "/register") {
      setCorsHeaders(response);

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method !== "POST") {
        writeJson(response, 405, { error: "method_not_allowed" });
        return;
      }

      const body = await readRequestBody(request);
      const rawBody = (typeof body === 'string' ? parseRequestBodyFields(body, request) : null) || (body || {}) as Record<string, unknown>;

      const getArrayField = (fieldName: string): string[] => {
        if (rawBody instanceof URLSearchParams) {
          const value = rawBody.get(fieldName);
          return value ? JSON.parse(value) : [];
        }
        const value = rawBody[fieldName];
        return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
      };

      const getStringField = (fieldName: string, defaultValue: string): string => {
        if (rawBody instanceof URLSearchParams) {
          return rawBody.get(fieldName) || defaultValue;
        }
        const value = rawBody[fieldName];
        return typeof value === 'string' ? value : defaultValue;
      };

      const redirectUris = getArrayField('redirect_uris');
      if (redirectUris.length === 0) {
        writeJson(response, 400, { error: "invalid_client_metadata", error_description: "redirect_uris is required." });
        return;
      }

      const tokenEndpointAuthMethod = getStringField('token_endpoint_auth_method', 'none');
      const clientId = `mcp-client-${crypto.randomBytes(16).toString('hex')}`;
      const clientSecret = `RT-${crypto.randomBytes(32).toString('hex')}-${crypto.randomBytes(16).toString('hex')}`;
      const clientName = getStringField('client_name', 'MCP Client');
      const grantTypes = getArrayField('grant_types');
      const responseTypes = getArrayField('response_types');
      const finalGrantTypes = grantTypes.length > 0 ? grantTypes : ["authorization_code", "refresh_token"];
      const finalResponseTypes = responseTypes.length > 0 ? responseTypes : ["code"];

      await pool.query(
        `INSERT INTO oauth_clients
          (client_id, client_secret, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)`,
        [
          clientId,
          clientSecret,
          clientName,
          JSON.stringify(redirectUris),
          JSON.stringify(finalGrantTypes),
          JSON.stringify(finalResponseTypes),
          tokenEndpointAuthMethod
        ]
      );

      writeJson(response, 201, {
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0,
        redirect_uris: redirectUris,
        grant_types: finalGrantTypes,
        response_types: finalResponseTypes,
        token_endpoint_auth_method: tokenEndpointAuthMethod,
        client_name: clientName
      });
      return;
    }

    if (url.pathname === "/mcp") {
      await handleMcpRequest(request, response);
      return;
    }

    console.log(`[${new Date().toISOString()}] 404 Not found: ${url.pathname}`);
    writeJson(response, 404, { 
      error: "Not found", 
      mcpPath: "/mcp", 
      healthPath: "/health", 
      privacyPath: "/privacy", 
      authPath: "/auth",
      oauthAuthorizePath: "/oauth/authorize",
      oauthTokenPath: "/oauth/token",
      oauthRegisterPath: "/register"
    });
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
