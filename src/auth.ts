import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

// OAuth 2.0 credentials
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'demo-client';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || 'demo-secret';

// OAuth 2.0 storage (in production, use Redis or database)
const authCodes = new Map<string, { userId: string; expiresAt: number }>();
const accessTokens = new Map<string, { userId: string; expiresAt: number }>();

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

// Generate authorization code
export function generateAuthCode(userId: string): string {
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  authCodes.set(code, { userId, expiresAt });
  return code;
}

// Validate authorization code
export function validateAuthCode(code: string): { valid: boolean; userId?: string } {
  const authData = authCodes.get(code);
  if (!authData) {
    return { valid: false };
  }
  
  if (Date.now() > authData.expiresAt) {
    authCodes.delete(code);
    return { valid: false };
  }
  
  authCodes.delete(code); // One-time use
  return { valid: true, userId: authData.userId };
}

// Generate OAuth access token
export function generateOAuthAccessToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  accessTokens.set(token, { userId, expiresAt });
  return token;
}

// Validate OAuth access token
export function validateOAuthAccessToken(token: string): { valid: boolean; userId?: string } {
  const tokenData = accessTokens.get(token);
  if (!tokenData) {
    return { valid: false };
  }
  
  if (Date.now() > tokenData.expiresAt) {
    accessTokens.delete(token);
    return { valid: false };
  }
  
  return { valid: true, userId: tokenData.userId };
}

// Handle OAuth authorization request
export async function handleOAuthAuthorization(
  request: OAuthAuthorizationRequest,
  userId: string
): Promise<{ code: string; state?: string }> {
  // Validate client_id
  if (request.client_id !== OAUTH_CLIENT_ID) {
    throw new Error('Invalid client_id');
  }
  
  const code = generateAuthCode(userId);
  return { code, state: request.state };
}

// Handle OAuth token request
export async function handleOAuthToken(
  request: OAuthTokenRequest
): Promise<OAuthTokenResponse> {
  const { code, client_id, client_secret } = request;
  
  // Validate client credentials
  if (client_id !== OAUTH_CLIENT_ID) {
    throw new Error('Invalid client_id');
  }
  
  if (client_secret !== OAUTH_CLIENT_SECRET) {
    throw new Error('Invalid client_secret');
  }
  
  const validation = validateAuthCode(code);
  if (!validation.valid || !validation.userId) {
    throw new Error('Invalid or expired authorization code');
  }
  
  const access_token = generateOAuthAccessToken(validation.userId);
  
  return {
    access_token,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: request.scope || 'read'
  };
}
