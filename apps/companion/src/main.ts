import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { join } from 'node:path';
import { createCompanionApi } from './api';
import type { CompanionSettings } from './core/settings';
import { checkForUpdates } from './core/settings';
import { normalizeSettings } from './core/settings';
import {
  activityFingerprint,
  describeActive,
  resolveActivity,
  type CompanionState,
} from './core/state';
import type { ActionResult, AppSnapshot, LinkResult, SyncSnapshot } from './ipc';
import { configureLogger, log, recentLogs } from './logger';
import { RpcManager, type RpcSnapshot } from './rpc';
import { SettingsStore } from './store';

const API_URL = process.env.COMPANION_API_URL ?? 'http://localhost:3000';
const RPC_CLIENT_ID = process.env.COMPANION_RPC_CLIENT_ID ?? process.env.DISCORD_RPC_CLIENT_ID ?? '';
const UPDATE_FEED_URL = process.env.COMPANION_UPDATE_FEED_URL ?? '';
const MIN_POLL_SECONDS = 15;

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: SettingsStore;
let rpc: RpcManager;
let polling: NodeJS.Timeout | null = null;
let quitting = false;
let companionState: CompanionState | null = null;
let updateInfo: AppSnapshot['update'] = null;
let applying = false;
let lastFingerprint = '';
let sync: SyncSnapshot = { lastSyncAt: null, lastAppliedAt: null, lastError: null, polling: false };

function settings(): CompanionSettings {
  return store.get();
}

function apiClient() {
  const current = settings();
  return createCompanionApi({ apiUrl: current.apiUrl, token: current.deviceToken });
}

function snapshot(): AppSnapshot {
  return {
    version: app.getVersion(),
    linked: Boolean(settings().deviceToken && settings().deviceId),
    settings: { ...settings(), deviceToken: settings().deviceToken ? 'stored' : null },
    rpc: rpc.getState(),
    sync,
    state: companionState,
    logs: recentLogs().slice(-120),
    update: updateInfo,
    platform: process.platform,
  };
}

function push(): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send('app:snapshot', snapshot());
  }
  updateTrayTooltip();
}

function updateTrayTooltip(): void {
  if (!tray) return;
  const rpcLabel = rpc.getState().status === 'connected' ? 'Discord connected' : 'Discord offline';
  tray.setToolTip(`AvenqioPresence — ${rpcLabel} · ${describeActive(companionState)}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open AvenqioPresence', click: () => showWindow() },
      { type: 'separator' },
      { label: `Discord: ${rpcLabel}`, enabled: false },
      { label: `Publishing: ${describeActive(companionState)}`, enabled: false },
      { type: 'separator' },
      { label: 'Publish nothing (clear presence)', click: () => void clearPresence() },
      { type: 'separator' },
      { label: 'Quit', click: () => void shutdown() },
    ]),
  );
}

function showWindow(): void {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/** Applies whatever the dashboard says is active to the local Discord client. */
async function applyActiveState(force = false): Promise<void> {
  if (applying) return;
  const resolved = resolveActivity(companionState);
  const fingerprint = activityFingerprint(resolved);
  if (!force && fingerprint === lastFingerprint) return;

  applying = true;
  try {
    if (!settings().autoPublish) {
      sync = { ...sync, lastError: null };
      return;
    }
    if (resolved.kind === 'none') {
      await rpc.publish(null);
    } else {
      const result = await rpc.publishPayload(resolved.payload, resolved.payload.applicationName);
      if (!result.ok) {
        sync = { ...sync, lastError: result.error };
        return;
      }
    }
    lastFingerprint = fingerprint;
    sync = { ...sync, lastAppliedAt: new Date().toISOString(), lastError: null };
    log('info', 'applied presence', { kind: resolved.kind, id: resolved.kind === 'none' ? null : resolved.id });
  } finally {
    applying = false;
    push();
  }
}

async function clearPresence(): Promise<void> {
  try {
    if (settings().deviceToken) {
      companionState = await apiClient().select({ presenceId: null, presetId: null });
    }
  } catch (error) {
    log('warn', 'could not clear the selection on the dashboard', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  companionState = companionState
    ? { ...companionState, active: { kind: 'none', presenceId: null, presetId: null, label: null }, activePresenceId: null }
    : null;
  lastFingerprint = '';
  await applyActiveState(true);
  push();
}

async function syncOnce(): Promise<void> {
  const current = settings();
  if (!current.deviceToken || !current.deviceId) {
    push();
    return;
  }
  sync = { ...sync, polling: true };
  try {
    companionState = await apiClient().state();
    sync = { ...sync, lastSyncAt: new Date().toISOString(), lastError: null };
    await applyActiveState();
    await apiClient()
      .heartbeat({
        appVersion: app.getVersion(),
        rpcConnected: rpc.getState().status === 'connected',
        appliedPresenceId: companionState?.active.presenceId ?? null,
        lastError: rpc.getState().lastError,
      })
      .catch((error: unknown) => {
        log('debug', 'heartbeat failed', { message: error instanceof Error ? error.message : String(error) });
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sync = { ...sync, lastError: message };
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      log('warn', 'the device token was rejected — pairing is required again');
      store.clearDevice();
      companionState = null;
      await rpc.publish(null);
    } else {
      log('warn', 'sync failed', { message });
    }
  } finally {
    sync = { ...sync, polling: false };
    push();
  }
}

function schedulePolling(): void {
  if (polling) clearInterval(polling);
  const seconds = Math.max(MIN_POLL_SECONDS, companionState?.pollIntervalSeconds ?? 30);
  polling = setInterval(() => void syncOnce(), seconds * 1000);
  polling.unref?.();
}

function applyAutoStart(enabled: boolean): void {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
}

function createWindow(): void {
  const iconPath = join(__dirname, 'icon.png');
  window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 780,
    minHeight: 620,
    show: false,
    backgroundColor: '#08070d',
    autoHideMenuBar: true,
    title: 'AvenqioPresence',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.loadFile(join(__dirname, 'renderer', 'index.html'));

  window.once('ready-to-show', () => {
    const hidden = process.argv.includes('--hidden');
    if (!hidden) window?.show();
  });

  window.on('close', (event) => {
    if (quitting || !settings().minimizeToTray) return;
    event.preventDefault();
    window?.hide();
    log('info', 'window hidden to tray');
  });

  // No in-app navigation and no popups: the renderer only talks over IPC.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
}

function createTray(): void {
  const image = nativeImage.createFromPath(join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.on('click', () => showWindow());
  updateTrayTooltip();
}

async function shutdown(): Promise<void> {
  quitting = true;
  if (polling) clearInterval(polling);
  await rpc.destroy();
  app.quit();
}

function registerIpc(): void {
  ipcMain.handle('app:snapshot', () => snapshot());

  ipcMain.handle('app:link', async (_event, rawCode: unknown): Promise<LinkResult> => {
    const pairingCode = typeof rawCode === 'string' ? rawCode.trim() : '';
    if (!/^[A-Za-z0-9-]{8,24}$/.test(pairingCode)) {
      return { ok: false, error: 'Enter the 8-character code shown on the dashboard.' };
    }
    try {
      const linked = await createCompanionApi({ apiUrl: settings().apiUrl }).link({
        pairingCode: pairingCode.toUpperCase(),
        deviceName: process.env.COMPUTERNAME ?? 'Windows PC',
        os: process.platform,
        appVersion: app.getVersion(),
      });
      store.update({ deviceId: linked.deviceId, deviceToken: linked.deviceToken });
      lastFingerprint = '';
      await syncOnce();
      log('info', 'device paired', { deviceId: linked.deviceId });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pairing failed';
      log('warn', 'pairing failed', { message });
      return { ok: false, error: message };
    } finally {
      push();
    }
  });

  ipcMain.handle('app:unlink', async (): Promise<ActionResult> => {
    store.clearDevice();
    companionState = null;
    lastFingerprint = '';
    await rpc.publish(null);
    // Reset the local fingerprint so a later pairing publishes immediately.
    lastFingerprint = 'none';
    push();
    return { ok: true };
  });

  ipcMain.handle('app:select', async (_event, input: unknown): Promise<ActionResult> => {
    const value = (input ?? {}) as { presenceId?: unknown; presetId?: unknown };
    const presenceId = typeof value.presenceId === 'string' ? value.presenceId : null;
    const presetId = typeof value.presetId === 'string' ? value.presetId : null;
    try {
      companionState = await apiClient().select({ presenceId, presetId });
      lastFingerprint = '';
      await applyActiveState(true);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not switch presence';
      log('warn', 'selection failed', { message });
      return { ok: false, error: message };
    } finally {
      push();
    }
  });

  ipcMain.handle('app:refresh', async (): Promise<ActionResult> => {
    await syncOnce();
    return sync.lastError ? { ok: false, error: sync.lastError } : { ok: true };
  });

  ipcMain.handle('app:settings', async (_event, patch: unknown): Promise<AppSnapshot> => {
    const input = (patch ?? {}) as Partial<CompanionSettings>;
    const allowed: Partial<CompanionSettings> = {};
    if (typeof input.startWithWindows === 'boolean') {
      allowed.startWithWindows = input.startWithWindows;
      applyAutoStart(input.startWithWindows);
    }
    if (typeof input.minimizeToTray === 'boolean') allowed.minimizeToTray = input.minimizeToTray;
    if (typeof input.autoPublish === 'boolean') allowed.autoPublish = input.autoPublish;
    if (typeof input.autoUpdates === 'boolean') allowed.autoUpdates = input.autoUpdates;
    if (typeof input.apiUrl === 'string') {
      allowed.apiUrl = normalizeSettings({ apiUrl: input.apiUrl }, settings().apiUrl).apiUrl;
    }
    store.update(allowed);
    if (allowed.autoPublish) {
      lastFingerprint = '';
      await applyActiveState(true);
    }
    push();
    return snapshot();
  });

  ipcMain.handle('app:check-updates', async () => {
    const result = await checkForUpdates(UPDATE_FEED_URL || null, app.getVersion());
    updateInfo = result;
    store.update({ lastUpdateCheck: new Date().toISOString() });
    push();
    return result;
  });

  ipcMain.handle('app:open-external', async (_event, url: unknown): Promise<ActionResult> => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      return { ok: false, error: 'Only http(s) links can be opened.' };
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('app:copy', (_event, text: unknown) => {
    if (typeof text === 'string') clipboard.writeText(text.slice(0, 4096));
  });

  ipcMain.on('app:quit', () => void shutdown());
  ipcMain.on('app:hide', () => window?.hide());
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(async () => {
    configureLogger(join(app.getPath('userData'), 'logs'));
    store = new SettingsStore(app.getPath('userData'), API_URL);
    applyAutoStart(settings().startWithWindows);

    if (!RPC_CLIENT_ID) {
      log('warn', 'no RPC client id configured — set DISCORD_RPC_CLIENT_ID in .env.local and rebuild');
    }
    rpc = new RpcManager(RPC_CLIENT_ID || '0', (snapshot: RpcSnapshot) => {
      log('debug', 'rpc status', { status: snapshot.status });
      push();
    });
    rpc.onStatus((snapshot) => {
      if (snapshot.status === 'connected') {
        lastFingerprint = '';
        void applyActiveState(true);
      }
    });

    registerIpc();
    createWindow();
    createTray();

    void rpc.connect();
    await syncOnce();
    schedulePolling();

    if (settings().autoUpdates && UPDATE_FEED_URL) {
      updateInfo = await checkForUpdates(UPDATE_FEED_URL, app.getVersion());
      push();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  app.on('window-all-closed', () => {
    // The companion keeps publishing from the tray, so closing the window is not quitting.
    if (process.platform === 'darwin') return;
  });

  app.on('before-quit', () => {
    quitting = true;
  });
}
