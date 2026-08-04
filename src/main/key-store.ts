import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { KeyStatus } from '../shared/contracts';

interface StoredSecret {
  version: 1;
  ciphertext: string;
}

export class KeyStore {
  private readonly filePath: string;

  constructor(private readonly userDataPath: string) {
    this.filePath = path.join(userDataPath, 'openai-key.json');
  }

  async status(): Promise<KeyStatus> {
    let hasKey: boolean;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as StoredSecret;
      hasKey = parsed.version === 1 && typeof parsed.ciphertext === 'string';
    } catch {
      hasKey = false;
    }

    return {
      hasKey,
      encryptionAvailable: await safeStorage.isAsyncEncryptionAvailable(),
    };
  }

  async set(apiKey: string): Promise<void> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error('secure_storage_unavailable');
    }

    const ciphertext = await safeStorage.encryptStringAsync(apiKey);
    await mkdir(this.userDataPath, { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    const payload: StoredSecret = { version: 1, ciphertext: ciphertext.toString('base64') };
    await writeFile(temporaryPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  async get(): Promise<string> {
    const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as StoredSecret;
    if (parsed.version !== 1 || typeof parsed.ciphertext !== 'string') {
      throw new Error('missing_api_key');
    }

    const decrypted = await safeStorage.decryptStringAsync(Buffer.from(parsed.ciphertext, 'base64'));
    if (decrypted.shouldReEncrypt) {
      await this.set(decrypted.result);
    }
    return decrypted.result;
  }

  async delete(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
