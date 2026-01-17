import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url('DATABASE_URL must be a valid URL'),

  APP_ENCRYPTION_KEY_B64: z
    .string()
    .min(1, 'APP_ENCRYPTION_KEY_B64 cannot be empty')
    .refine(
      (val) => {
        try {
          const decoded = Buffer.from(val, 'base64');
          return decoded.length === 32;
        } catch {
          return false;
        }
      },
      { message: 'APP_ENCRYPTION_KEY_B64 must be a valid base64-encoded 32-byte key' }
    ),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters'),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  APP_MODE: z
    .enum(['web', 'worker'])
    .optional(),

  HTTPS_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),

  ADMIN_SETUP_TOKEN: z
    .string()
    .optional(),

  GIT_BACKUP_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),

  GIT_BACKUP_PATH: z.string().optional(),
  GIT_BACKUP_REMOTE: z.string().optional(),

  WEB_SEARCH_API_KEY: z.string().optional(),

  APP_LOCALE: z.string().default('zh-CN'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.email().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.format();
    const errorMessages: string[] = [];

    for (const [key, value] of Object.entries(errors)) {
      if (key === '_errors') continue;
      const fieldErrors = value as { _errors?: string[] };
      if (fieldErrors._errors?.length) {
        errorMessages.push(`  - ${key}: ${fieldErrors._errors.join(', ')}`);
      }
    }

    console.error('Environment validation failed:');
    console.error(errorMessages.join('\n'));
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing or invalid environment variables:\n${errorMessages.join('\n')}`);
    } else {
      console.warn('Continuing with missing environment variables (development mode)');
      return result.data as unknown as Env;
    }
  }

  return result.data;
}

export const env = validateEnv();

export function getDatabaseUrl(): string {
  return env.DATABASE_URL;
}

export function getEncryptionKey(): Buffer {
  return Buffer.from(env.APP_ENCRYPTION_KEY_B64, 'base64');
}

export function getSessionSecret(): string {
  return env.SESSION_SECRET;
}

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

export function isWorkerMode(): boolean {
  return env.APP_MODE === 'worker';
}

export function isGitBackupEnabled(): boolean {
  return env.GIT_BACKUP_ENABLED;
}
