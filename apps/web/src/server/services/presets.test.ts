import { describe, expect, it } from 'vitest';
import { computePresetAccess } from './presets';

const published = { status: 'published' as const, minRole: 'member' as const };

describe('computePresetAccess', () => {
  it('denies users without a membership', () => {
    expect(computePresetAccess(null, published)).toBe(false);
  });

  it('denies drafts even for owners', () => {
    expect(computePresetAccess('owner', { status: 'draft', minRole: 'member' })).toBe(false);
  });

  it('lets an explicit revoke win over a sufficient role', () => {
    expect(computePresetAccess('owner', { ...published, grant: false })).toBe(false);
  });

  it('lets an explicit grant override the minimum role', () => {
    expect(computePresetAccess('member', { status: 'published', minRole: 'admin', grant: true })).toBe(true);
  });

  it('falls back to the ordered role requirement', () => {
    expect(computePresetAccess('member', { status: 'published', minRole: 'preset_manager' })).toBe(false);
    expect(computePresetAccess('preset_manager', { status: 'published', minRole: 'preset_manager' })).toBe(true);
    expect(computePresetAccess('admin', { status: 'published', minRole: 'preset_manager' })).toBe(true);
    expect(computePresetAccess('owner', { status: 'published', minRole: 'admin' })).toBe(true);
  });

  it('never lets a plain member satisfy an admin requirement', () => {
    expect(computePresetAccess('member', { status: 'published', minRole: 'admin' })).toBe(false);
  });
});
