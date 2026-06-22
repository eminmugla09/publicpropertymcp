-- Property Records MCP Server Database Schema
-- PostgreSQL Schema for Neon Database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- OAuth tables (matching FPL structure)
CREATE TABLE IF NOT EXISTS oauth_codes (
    code TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT,
    code_challenge_method TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
    refresh_token TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_secret TEXT,
    client_name TEXT,
    redirect_uris JSONB NOT NULL,
    grant_types JSONB NOT NULL,
    response_types JSONB NOT NULL,
    token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Property Records table
CREATE TABLE property_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    owner_name VARCHAR(255) NOT NULL,
    alternate_names TEXT[],
    email VARCHAR(255),
    phone VARCHAR(20),
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    zip VARCHAR(10) NOT NULL,
    county VARCHAR(100) NOT NULL,
    parcel_id VARCHAR(50),
    legal_description TEXT,
    event_type VARCHAR(100) NOT NULL,
    recording_date TIMESTAMP WITH TIME ZONE NOT NULL,
    closing_date TIMESTAMP WITH TIME ZONE,
    document_number VARCHAR(50),
    book_page VARCHAR(50),
    sale_price DECIMAL(15, 2),
    assessed_value DECIMAL(15, 2),
    confidence VARCHAR(20) NOT NULL,
    source VARCHAR(255) NOT NULL,
    utility_provider VARCHAR(100) NOT NULL,
    property_type VARCHAR(100) NOT NULL,
    has_garage BOOLEAN NOT NULL,
    known_property BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX idx_property_records_user_id ON property_records(user_id);
CREATE INDEX idx_property_records_owner_name ON property_records(owner_name);
CREATE INDEX idx_property_records_email ON property_records(email);
CREATE INDEX idx_property_records_address ON property_records(address);
CREATE INDEX idx_property_records_recording_date ON property_records(recording_date);
CREATE INDEX idx_property_records_parcel_id ON property_records(parcel_id);
CREATE INDEX idx_oauth_codes_code ON oauth_codes(code);
CREATE INDEX idx_oauth_codes_client_id ON oauth_codes(client_id);
CREATE INDEX idx_oauth_codes_user_id ON oauth_codes(user_id);
CREATE INDEX idx_oauth_refresh_tokens_refresh_token ON oauth_refresh_tokens(refresh_token);
CREATE INDEX idx_oauth_refresh_tokens_client_id ON oauth_refresh_tokens(client_id);
CREATE INDEX idx_oauth_refresh_tokens_user_id ON oauth_refresh_tokens(user_id);
