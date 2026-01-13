import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const keyB64 = process.env.APP_ENCRYPTION_KEY_B64;
  if (!keyB64) {
    throw new Error('APP_ENCRYPTION_KEY_B64 environment variable is required');
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes`);
  }
  return key;
}

export function encryptApiKey(apiKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
  });
}

export function decryptApiKey(encryptedData: string): string {
  const key = getEncryptionKey();
  const { ciphertext, iv, tag } = JSON.parse(encryptedData);
  
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
