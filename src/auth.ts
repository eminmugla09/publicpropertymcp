import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

// OAuth 2.0 credentials
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'demo-client';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || 'demo-secret';

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

// OAuth 2.0 database storage
const getRegisteredOauthClient = async (clientId: string) => {
  try {
    const result = await pool.query(
      'SELECT client_id, client_secret, redirect_uris, grant_types, response_types, token_endpoint_auth_method FROM oauth_clients WHERE client_id = $1',
      [clientId]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return {
      client_id: result.rows[0].client_id,
      client_secret: result.rows[0].client_secret,
      redirect_uris: result.rows[0].redirect_uris,
      grant_types: result.rows[0].grant_types,
      response_types: result.rows[0].response_types,
      token_endpoint_auth_method: result.rows[0].token_endpoint_auth_method
    };
  } catch (error) {
    console.error('Error getting OAuth client:', error);
    return null;
  }
};

export const ensureOAuthClient = async () => {
  try {
    const result = await pool.query(
      'SELECT client_id FROM oauth_clients WHERE client_id = $1',
      [OAUTH_CLIENT_ID]
    );
    
    if (result.rows.length === 0) {
      await pool.query(
        `INSERT INTO oauth_clients (client_id, client_secret, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          OAUTH_CLIENT_ID,
          OAUTH_CLIENT_SECRET || null,
          'Property Records MCP',
          JSON.stringify(['http://localhost:3000/callback', 'https://publicproperty.up.railway.app/callback']),
          JSON.stringify(['authorization_code']),
          JSON.stringify(['code']),
          OAUTH_CLIENT_SECRET ? 'client_secret_post' : 'none'
        ]
      );
    }
  } catch (error) {
    console.error('Error ensuring OAuth client:', error);
  }
};

export { getRegisteredOauthClient };

export interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: Date;
  updated_at: Date;
  last_login: Date | null;
  is_active: boolean;
}

export interface RegisterInput {
  email: string;
  password: string;
  full_name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const { email, password, full_name } = input;

  if (!email || !password) {
    return { success: false, message: 'Email and password are required' };
  }

  if (password.length < 8) {
    return { success: false, message: 'Password must be at least 8 characters' };
  }

  try {
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return { success: false, message: 'Email already registered' };
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name) 
         VALUES ($1, $2, $3) 
         RETURNING id, email, full_name, created_at, updated_at, last_login, is_active`,
      [email.toLowerCase(), password_hash, full_name || null]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1y' }
    );

    return {
      success: true,
      message: 'User registered successfully',
      user: user,
      token: token
    };

  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, message: 'Registration failed' };
  }
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const { email, password } = input;

  if (!email || !password) {
    return { success: false, message: 'Email and password are required' };
  }

  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, full_name, created_at, updated_at, last_login, is_active 
         FROM users 
         WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return { success: false, message: 'Invalid email or password' };
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return { success: false, message: 'Account is deactivated' };
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return { success: false, message: 'Invalid email or password' };
    }

    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1y' }
    );

    const { password_hash, ...userWithoutPassword } = user;

    return {
      success: true,
      message: 'Login successful',
      user: userWithoutPassword,
      token: token
    };

  } catch (error) {
    console.error('Login error:', error);
    return { success: false, message: 'Login failed' };
  }
}

export function verifyToken(token: string): { valid: boolean; userId?: string; email?: string } {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    return { valid: true, userId: decoded.userId, email: decoded.email };
  } catch (error) {
    return { valid: false };
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, created_at, updated_at, last_login, is_active 
         FROM users 
         WHERE id = $1`,
      [userId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

// OAuth 2.0 Authorization Code Flow
export interface OAuthAuthorizationRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
}

export interface OAuthTokenRequest {
  grant_type: string;
  code: string;
  redirect_uri: string;
  client_id: string;
  client_secret?: string;
  scope?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// Handle OAuth authorization request
export async function handleOAuthAuthorization(
  request: OAuthAuthorizationRequest,
  userId: string,
  userEmail: string
): Promise<{ code: string; state?: string }> {
  const oauthClient = request.client_id ? await getRegisteredOauthClient(request.client_id) : null;
  
  if (!oauthClient || request.response_type !== 'code') {
    throw new Error('Invalid client or response_type');
  }
  
  if (oauthClient.redirect_uris && !oauthClient.redirect_uris.includes(request.redirect_uri)) {
    throw new Error('Invalid redirect_uri');
  }
  
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  await pool.query(
    `INSERT INTO oauth_codes (code, client_id, user_id, email, redirect_uri, code_challenge, code_challenge_method, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [code, oauthClient.client_id, userId, userEmail, request.redirect_uri, null, null, expiresAt]
  );
  
  return { code, state: request.state };
}

// Handle OAuth token request
export async function handleOAuthToken(
  request: OAuthTokenRequest
): Promise<OAuthTokenResponse> {
  const { code, client_id, client_secret } = request;
  
  const oauthClient = client_id ? await getRegisteredOauthClient(client_id) : null;
  
  if (!oauthClient) {
    throw new Error('Invalid client_id');
  }
  
  if (oauthClient.token_endpoint_auth_method === 'client_secret_post' || oauthClient.token_endpoint_auth_method === 'client_secret_basic') {
    if (!oauthClient.client_secret || client_secret !== oauthClient.client_secret) {
      throw new Error('Invalid client_secret');
    }
  }
  
  const result = await pool.query(
    'SELECT * FROM oauth_codes WHERE code = $1',
    [code]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Invalid authorization code');
  }
  
  const row = result.rows[0];
  
  if (row.used) {
    throw new Error('Authorization code already used');
  }
  
  if (new Date() > new Date(row.expires_at)) {
    throw new Error('Authorization code expired');
  }
  
  if (row.client_id !== oauthClient.client_id) {
    throw new Error('Authorization code client mismatch');
  }
  
  await pool.query('UPDATE oauth_codes SET used = TRUE WHERE code = $1', [code]);
  
  const access_token = crypto.randomBytes(32).toString('hex');
  const refresh_token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  await pool.query(
    `INSERT INTO oauth_refresh_tokens (refresh_token, client_id, user_id, email, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [refresh_token, oauthClient.client_id, row.user_id, row.email, refreshExpiresAt]
  );
  
  return {
    access_token,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: request.scope || 'read'
  };
}
