# Property Records MCP — Project Guide

## Purpose

TypeScript/Node.js MCP server that exposes public property record lookup tools.
Supports searching by owner, recent purchase events, matching properties to customers, and address lookup.
Includes OAuth 2.0 authorization code flow for ChatGPT integration.

## Repository Layout

- `src/index.ts` — main entrypoint: MCP server, HTTP endpoints, OAuth flow
- `src/auth.ts` — JWT auth, login/registration, OAuth token/authorization helpers
- `schema.sql` — PostgreSQL schema (users, OAuth tables, property_records)
- `seed-data.sql` — sample property records and users
- `migrate-db.js` — startup migration runner

## Build / Run

```bash
# Install dependencies
npm install

# Build (TypeScript -> dist/)
npm run build

# Start server
npm start

# Dev mode
npm run dev
```

## Database Setup

Requires a PostgreSQL database. Set `DATABASE_URL` before running.

```bash
# Example local setup
export DATABASE_URL="postgresql://localhost:5432/publicpropertymcp?sslmode=disable"
createdb publicpropertymcp
psql -d publicpropertymcp -f schema.sql
psql -d publicpropertymcp -f seed-data.sql
```

The server calls `runMigration()` on startup and ensures the OAuth client exists.

## Testing

```bash
# Run the full test suite
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run src/tests/search_properties.test.ts

# Run tests with coverage report
npm test -- --coverage
```

Tests are integration tests backed by a real PostgreSQL database.
Set `DATABASE_URL` to a test database before running tests, or the test harness will default to a local test DB.

```bash
export DATABASE_URL="postgresql://localhost:5432/publicpropertymcp_test?sslmode=disable"
createdb publicpropertymcp_test
npm test
```

### Test Coverage Goals

- **Target Coverage**: 100% statement, branch, function, and line coverage
- **Current Coverage**: ~28% statements, ~19% branches, ~24% functions, ~28% lines
- **Gap Areas**: 
  - `auth.ts`: Needs comprehensive OAuth and authentication flow testing (currently ~16%)
  - `index.ts`: Error handling, edge cases, and utility functions need coverage
  - HTTP server and OAuth endpoint testing
  - Database migration and connection handling

### Test Structure

```
src/tests/
├── helpers.ts              # Test database setup/teardown utilities
└── property-tools.test.ts  # Property record search and matching tests
```

### Testing Best Practices

1. **Database Isolation**: Each test file creates its own test database to ensure isolation
2. **Test Data**: Use seed data for consistent test scenarios
3. **Handler Testing**: Test each handler independently with realistic inputs
4. **Error Cases**: Test error handling, edge cases, and validation
5. **Authentication**: Test both authenticated and unauthenticated scenarios
6. **OAuth Flow**: Test OAuth authorization code flow components
7. **Data Validation**: Test input validation and sanitization
8. **Address Normalization**: Test fuzzy matching and address normalization

### Adding New Tests

When adding a new tool or handler:

1. Create a test file in `src/tests/` following the naming convention `[category]-tools.test.ts`
2. Use the test helper functions from `helpers.ts` for database setup
3. Test both success and failure scenarios
4. Include edge cases and validation testing
5. Verify database state changes where appropriate
6. Test authentication and authorization if applicable

## Key Conventions

- ESM modules (`"type": "module"` in package.json).
- Tools are registered via `server.registerTool(name, { description, inputSchema }, handler)`.
- Property address normalization strips spaces, periods, and commas for fuzzy matching.
- `REFERENCE_DATE` is fixed at `2026-06-21T00:00:00Z` for "recent" event calculations.
- OAuth 2.0 authorization code flow with PKCE for secure ChatGPT integration.
- Database connections use connection pooling for performance.
- All database operations use parameterized queries to prevent SQL injection.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | `your-secret-key-change-in-production` | JWT signing secret |
| `MCP_TRANSPORT` | `stdio` | `http` or `stdio` |
| `PORT` | `3000` | HTTP port (also forces HTTP transport if set) |
| `OAUTH_CLIENT_ID` | `demo-client` | OAuth client ID |
| `OAUTH_CLIENT_SECRET` | `demo-secret` | OAuth client secret |

## Development Guidelines

### Code Style

- Use TypeScript for type safety
- Follow existing naming conventions (camelCase for variables, PascalCase for types)
- Add JSDoc comments for complex functions
- Use async/await for asynchronous operations
- Handle errors gracefully with try-catch blocks
- Log errors for debugging but don't expose sensitive information

### Database Operations

- Always use parameterized queries
- Use transactions for multi-step operations
- Handle connection errors gracefully
- Close connections properly in cleanup
- Use connection pooling for performance

### Security

- Never log or expose sensitive data (passwords, tokens, PII)
- Validate and sanitize all user inputs
- Use OAuth 2.0 with PKCE for secure authorization
- Implement proper JWT token validation
- Follow principle of least privilege
- Keep dependencies updated

### Performance

- Use database indexes appropriately
- Implement caching where beneficial
- Optimize database queries
- Use connection pooling
- Implement pagination for large result sets
- Consider async operations for long-running tasks

### OAuth 2.0 Implementation

- Use PKCE (Proof Key for Code Exchange) for security
- Validate state parameters to prevent CSRF
- Implement proper token validation and refresh
- Secure token storage and transmission
- Handle token expiration gracefully
- Validate redirect URIs

## Common Tasks

- **Add a new tool**: Add a helper function and register it inside `createPropertyRecordsMcpServer()`. Create corresponding tests in `src/tests/`.
- **Update seed data**: Edit `seed-data.sql` and re-seed the test DB.
- **Run tests against fresh data**: Test setup applies schema/seed before each run.
- **Add OAuth scopes**: Update OAuth client configuration and token validation.
- **Handle errors**: Implement consistent error handling with meaningful error messages.
- **Add logging**: Use console.error for errors, but avoid logging sensitive information.

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is set correctly
- Check database server is running
- Ensure database exists and schema is applied
- Verify network connectivity and firewall rules

### Test Failures
- Check test database setup in `helpers.ts`
- Verify seed data is consistent
- Ensure test isolation (no shared state between tests)
- Check for timing issues with async operations
- Verify database cleanup between tests

### OAuth Issues
- Verify OAuth client credentials are set correctly
- Check redirect URI configuration
- Ensure state parameter validation is working
- Verify token validation and expiration
- Check PKCE implementation

### Authentication Issues
- Verify `JWT_SECRET` is set consistently
- Check token expiration and validation
- Ensure user exists and is active
- Verify proper token generation and signing

## Project Status

- **Test Coverage**: ~28% statements, ~19% branches, ~24% functions, ~28% lines
- **Test Count**: 22 tests passing across 1 test file
- **Known Coverage Gaps**: Auth module, OAuth flow, error handling, HTTP transport layer
- **Priority**: Increase coverage to 100% to identify all potential bugs

## Property Data Handling

### Address Normalization
- Strip spaces, periods, and commas for fuzzy matching
- Convert to lowercase for case-insensitive comparison
- Handle partial addresses and street-only matches
- Support various address formats and abbreviations

### Confidence Scoring
- High confidence: 2+ identity signals + known address match
- Medium confidence: 2+ identity signals OR known address match
- Low confidence: 1 identity signal
- No match: No identity signals match

### Recent Events
- Fixed reference date: `2026-06-21T00:00:00Z`
- Configurable days back parameter
- Filter by event type (purchase, sale, transfer)
- Chronological ordering with most recent first
