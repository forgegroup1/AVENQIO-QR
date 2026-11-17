import type { PresencePayload } from '@avenqio/shared';

/**
 * Shape accepted by `@xhayper/discord-rpc` (SetActivity). The dashboard payload
 * is the canonical contract; this module is the only place that translates it
 * into the local RPC library's field names.
 */
export type LocalActivity = {
  name: string;
  type: number;
  details?: string;
  state?: string;
  startTimestamp?: Date;
  endTimestamp?: Date;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  partySize?: number;
  partyMax?: number;
  buttons?: Array<{ label: string; url: string }>;
};

const ACTIVITY_TYPE: Record<PresencePayload['activityType'], number> = {
  playing: 0,
  listening: 2,
  watching: 3,
  competing: 5,
};

export function toLocalActivity(payload: PresencePayload, applicationName: string): LocalActivity {
  const activity: LocalActivity = {
    name: applicationName,
    type: ACTIVITY_TYPE[payload.activityType],
  };

  if (payload.details) activity.details = payload.details;
  if (payload.state) activity.state = payload.state;

  const start = payload.timestamps?.start;
  const end = payload.timestamps?.end;
  if (start) activity.startTimestamp = new Date(start);
  if (end) activity.endTimestamp = new Date(end);

  if (payload.largeImage) {
    activity.largeImageKey = payload.largeImage.source;
    if (payload.largeImage.text) activity.largeImageText = payload.largeImage.text;
  }
  if (payload.smallImage) {
    activity.smallImageKey = payload.smallImage.source;
    if (payload.smallImage.text) activity.smallImageText = payload.smallImage.text;
  }
  if (payload.party) {
    activity.partySize = payload.party.current;
    activity.partyMax = payload.party.max;
  }
  if (payload.buttons.length) {
    activity.buttons = payload.buttons.slice(0, 2).map((button) => ({ label: button.label, url: button.url }));
  }

  return activity;
}

/** Discord shows buttons only for the "Playing" activity type. */
export function buttonsSupported(payload: PresencePayload): boolean {
  return payload.activityType === 'playing';
}
