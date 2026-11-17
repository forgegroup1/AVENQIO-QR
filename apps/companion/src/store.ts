import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import { DEFAULT_SETTINGS, normalizeSettings, type CompanionSettings } from './core/settings';
import { log } from './logger';

type Persisted = Omit<CompanionSettings, 'deviceToken'> & {
  /** `safeStorage` ciphertext (base64) on Windows, or null when unavailable. */
  deviceTokenCipher: string | null;
};

const SECRET_MARKER = 'v1:';

/**
 * Settings live in `%APPDATA%/AvenqioPresence/settings.json`. The device token is
 * encrypted with Windows DPAPI through Electron's safeStorage; when that is not
 * available the token is deliberately kept in memory only, so a pairing must be
 * repeated after restart rather than writing a bearer token to disk in clear.
 */
export class SettingsStore {
  private readonly file: string;
  private settings: CompanionSettings;

  constructor(userDataDir: string, fallbackApiUrl: string) {
    this.file = join(userDataDir, 'settings.json');
    let raw: unknown = null;
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, 'utf8'));
      } catch (error) {
        log('warn', 'settings file is not valid JSON, starting from defaults', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.settings = normalizeSettings(raw, fallbackApiUrl);
    const cipher = (raw as Persisted | null)?.deviceTokenCipher;
    if (cipher && safeStorage.isEncryptionAvailable()) {
      try {
        this.settings.deviceToken = safeStorage.decryptString(Buffer.from(cipher.replace(SECRET_MARKER, ''), 'base64'));
      } catch {
        log('warn', 'stored device token could not be decrypted, pairing is required again');
      }
    }
  }

  get(): CompanionSettings {
    return { ...this.settings };
  }

  update(patch: Partial<CompanionSettings>): CompanionSettings {
    this.settings = { ...this.settings, ...patch };
    this.persist();
    return this.get();
  }

  clearDevice(): CompanionSettings {
    this.settings = { ...this.settings, deviceId: null, deviceToken: null };
    this.persist();
    return this.get();
  }

  private persist(): void {
    const { deviceToken, ...rest } = this.settings;
    let deviceTokenCipher: string | null = null;
    if (deviceToken) {
      if (safeStorage.isEncryptionAvailable()) {
        deviceTokenCipher = SECRET_MARKER + safeStorage.encryptString(deviceToken).toString('base64');
      } else {
        log('warn', 'OS credential encryption unavailable — the device token stays in memory only');
      }
    }
    const payload: Persisted = { ...rest, deviceTokenCipher };
    try {
      writeFileSync(this.file, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      log('error', 'could not write settings', { message: error instanceof Error ? error.message : String(error) });
    }
  }
}

export { DEFAULT_SETTINGS };
