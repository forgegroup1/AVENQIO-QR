import { getReadyDb } from '../db';
import { recentUserActivity } from './activity';
import { listCommunities, type CommunitySummary } from './communities';
import { listDevices, type DeviceDto } from './devices';
import { getProfile, type ProfileDto } from './profile';
import { listPresences, resolveActivePresence, type PresenceDto } from './presences';
import { listUsablePresets, type PresetDto } from './presets';
import type { ActivityLogDto } from '@avenqio/shared';

export type Overview = {
  profile: ProfileDto;
  stats: {
    communities: number;
    presences: number;
    activePresence: boolean;
    usablePresets: number;
    linkedDevices: number;
  };
  communities: CommunitySummary[];
  presences: PresenceDto[];
  presets: PresetDto[];
  devices: DeviceDto[];
  active: Awaited<ReturnType<typeof resolveActivePresence>>;
  activity: ActivityLogDto[];
};

export async function getOverview(userId: string): Promise<Overview> {
  const [profile, communities, presences, presets, devices, active, activity] = await Promise.all([
    getProfile(userId),
    listCommunities(userId),
    listPresences(userId),
    listUsablePresets(userId),
    listDevices(userId),
    resolveActivePresence(userId),
    recentUserActivity(userId, 6),
  ]);

  return {
    profile,
    stats: {
      communities: communities.length,
      presences: presences.length,
      activePresence: active.kind !== 'none',
      usablePresets: presets.length,
      linkedDevices: devices.filter((device) => device.status === 'linked').length,
    },
    communities,
    presences,
    presets,
    devices,
    active,
    activity,
  };
}

export async function countUnreadable(): Promise<number> {
  // Placeholder for future notification counters; intentionally returns 0 so the
  // UI never shows an invented badge.
  const db = await getReadyDb();
  await db.query('select 1');
  return 0;
}
