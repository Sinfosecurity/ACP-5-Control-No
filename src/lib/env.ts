// ============================================================
// lib/env.ts
// Environment variable validation
// Run at startup to fail fast if misconfigured
// ============================================================
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),

  // NYC Open Data (optional)
  NYC_OPEN_DATA_APP_TOKEN: z.string().optional(),

  // Playwright
  PLAYWRIGHT_HEADLESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((val: string) => val === 'true'),
  PLAYWRIGHT_TIMEOUT: z
    .string()
    .default('30000')
    .transform((val: string) => parseInt(val, 10))
    .pipe(z.number().min(5000).max(120000)),
  PLAYWRIGHT_SCREENSHOT_DIR: z.string().default('./tmp/screenshots'),

  // Rate Limiting
  RATE_LIMIT_MAX: z
    .string()
    .default('20')
    .transform((val: string) => parseInt(val, 10))
    .pipe(z.number().min(1).max(1000)),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000')
    .transform((val: string) => parseInt(val, 10))
    .pipe(z.number().min(1000).max(3600000)),

  // Node environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Validates and returns environment variables.
 * Throws on first call if validation fails.
 * Subsequent calls return cached result.
 */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Environment validation failed:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error(
      'Invalid environment configuration. Check the errors above and verify your .env.local file.'
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

/**
 * Call this at app startup to validate environment early.
 * Prevents runtime errors from missing/invalid env vars.
 */
export function validateEnv(): void {
  try {
    getEnv();
    console.log('✅ Environment variables validated successfully');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
