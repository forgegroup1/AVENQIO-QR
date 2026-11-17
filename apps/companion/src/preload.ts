import { contextBridge, ipcRenderer } from 'electron';
import type { ActionResult, AppSnapshot, CompanionBridge, LinkResult } from './ipc';
import type { CompanionSettings, UpdateCheck } from './core/settings';

/**
 * The renderer runs with `nodeIntegration: false`, `contextIsolation: true` and
 * `sandbox: true`. Everything it can do is listed here — no filesystem, no
 * Discord client, no token access.
 */
const bridge: CompanionBridge = {
  snapshot: () => ipcRenderer.invoke('app:snapshot') as Promise<AppSnapshot>,
  link: (pairingCode: string) => ipcRenderer.invoke('app:link', pairingCode) as Promise<LinkResult>,
  unlink: () => ipcRenderer.invoke('app:unlink') as Promise<ActionResult>,
  select: (input) => ipcRenderer.invoke('app:select', input) as Promise<ActionResult>,
  refresh: () => ipcRenderer.invoke('app:refresh') as Promise<ActionResult>,
  updateSettings: (patch: Partial<CompanionSettings>) =>
    ipcRenderer.invoke('app:settings', patch) as Promise<AppSnapshot>,
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates') as Promise<UpdateCheck>,
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url) as Promise<ActionResult>,
  copy: (text: string) => ipcRenderer.invoke('app:copy', text) as Promise<void>,
  quit: () => ipcRenderer.send('app:quit'),
  hideToTray: () => ipcRenderer.send('app:hide'),
  onSnapshot: (listener: (snapshot: AppSnapshot) => void) => {
    const handler = (_event: unknown, snapshot: AppSnapshot) => listener(snapshot);
    ipcRenderer.on('app:snapshot', handler);
    return () => ipcRenderer.removeListener('app:snapshot', handler);
  },
};

contextBridge.exposeInMainWorld('avenqio', bridge);
