import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

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
