import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

export function getEncryptionKey(): Buffer {
  const keyB64 = process.env.APP_ENCRYPTION_KEY_B64;
  if (!keyB64) {
    throw new Error(
      'APP_ENCRYPTION_KEY_B64 environment variable is required. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  
  let key: Buffer;
  try {
    key = Buffer.from(keyB64, 'base64');
  } catch {
    throw new Error('APP_ENCRYPTION_KEY_B64 is not valid base64');
  }
  
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `Encryption key must be exactly ${KEY_LENGTH} bytes (${KEY_LENGTH * 8} bits). ` +
      `Current key is ${key.length} bytes.`
    );
  }
  
  return key;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  const data: EncryptedData = {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
  };

  return JSON.stringify(data);
}

export function decrypt(encryptedJson: string): string {
  const key = getEncryptionKey();
  
  let data: EncryptedData;
  try {
    data = JSON.parse(encryptedJson);
  } catch {
    throw new Error('Invalid encrypted data format: not valid JSON');
  }

  const { ciphertext, iv, tag } = data;
  
  if (!ciphertext || !iv || !tag) {
    throw new Error('Invalid encrypted data format: missing required fields');
  }

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

export function encryptApiKey(apiKey: string): string {
  return encrypt(apiKey);
}

export function decryptApiKey(encryptedData: string): string {
  return decrypt(encryptedData);
}
