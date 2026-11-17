import type { PresencePayload } from './presence';

/**
 * Helpers that keep the visual editor honest about what Discord will render.
 * The editor shows a live Discord-style card, but it must not promise pixels
 * the RPC layer cannot deliver.
 */
export type PreviewField = 'details' | 'state' | 'largeImage' | 'smallImage' | 'party' | 'timestamps' | 'buttons';

export type RpcSupport = {
  supported: boolean;
  note: string;
};

export function rpcSupportFor(field: PreviewField): RpcSupport {
  switch (field) {
    case 'buttons':
      return {
        supported: true,
        note: 'Buttons render in the Discord desktop client only when the application is verified to show them; the web preview is illustrative.',
      };
    case 'largeImage':
      return {
        supported: true,
        note: 'Use an asset key uploaded to your Discord application, or an https image URL supported by modern clients.',
      };
    case 'smallImage':
      return { supported: true, note: 'The small image is overlaid on the bottom-right corner of the large image.' };
    case 'timestamps':
      return {
        supported: true,
        note: 'A start timestamp renders elapsed time; adding an end timestamp renders a progress bar.',
      };
    case 'party':
      return { supported: true, note: 'Party size renders as "current of max" next to the activity name.' };
    default:
      return { supported: true, note: '' };
  }
}

/** Fields Discord silently drops from the client view. */
export function hiddenFields(payload: PresencePayload): PreviewField[] {
  const hidden: PreviewField[] = [];
  if (!payload.largeImage) hidden.push('largeImage');
  if (!payload.smallImage) hidden.push('smallImage');
  if (!payload.party) hidden.push('party');
  if (!payload.timestamps) hidden.push('timestamps');
  if (!payload.buttons.length) hidden.push('buttons');
  return hidden;
}
