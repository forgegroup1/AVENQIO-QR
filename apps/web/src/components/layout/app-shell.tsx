'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { BrandLockup, BrandMark } from '@/components/layout/brand';
import { Avatar, Badge } from '@/components/ui/display';
import { useToast } from '@/components/ui/overlay';
import {
  IconActivity,
  IconChevronsLeft,
  IconChevronsRight,
  IconHome,
  IconLayers,
  IconLogout,
  IconMenu,
  IconPlug,
  IconSettings,
  IconShield,
  IconUsers,
  IconX,
} from '@/components/icons';
import { apiFetch } from '@/lib/api-client';

type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean; badge?: string };

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: <IconHome />, exact: true },
  { href: '/dashboard/presences', label: 'My presences', icon: <IconLayers /> },
  { href: '/dashboard/communities', label: 'Communities', icon: <IconUsers /> },
  { href: '/dashboard/integrations', label: 'Integrations', icon: <IconPlug /> },
  { href: '/dashboard/settings', label: 'Settings', icon: <IconSettings /> },
];

const COLLAPSE_KEY = 'avenqio:sidebar-collapsed';

export type ShellUser = {
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  isDev: boolean;
  isStaff: boolean;
};

export type CompanionStatus = {
  online: boolean;
  deviceName: string | null;
  rpcConnected: boolean | null;
};

export type CommunityOption = { id: string; name: string };

export function AppShell({
  user,
  companion,
  communities,
  children,
}: {
  user: ShellUser;
  companion: CompanionStatus;
  communities: CommunityOption[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const activeCommunityId = pathname.match(/^\/dashboard\/communities\/([^/]+)/)?.[1] ?? '';

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const nav = useMemo<NavItem[]>(
    () => (user.isStaff ? [...NAV, { href: '/dashboard/admin', label: 'Verification', icon: <IconShield /> }] : NAV),
    [user.isStaff],
  );

  const current = nav.find((item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const section = pathname.split('/')[2];

  const signOut = async () => {
    setSigningOut(true);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      toast({ title: 'Could not sign out', description: 'Please try again.', tone: 'error' });
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen">
      {user.isDev ? (
        <div className="border-b border-warning/20 bg-warning/[0.07] px-4 py-1.5 text-center text-[11.5px] text-warning">
          Development session — you are signed in with a seeded fixture account, not Discord OAuth2.{' '}
          <Link href="/docs#discord-oauth" className="underline decoration-warning/40 underline-offset-2">
            Configure Discord OAuth
          </Link>
        </div>
      ) : null}

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface/95 backdrop-blur transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
            collapsed ? 'w-[72px]' : 'w-[248px]',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className={cn('flex h-14 items-center border-b border-line px-3.5', collapsed && 'justify-center px-0')}>
            <BrandLockup collapsed={collapsed} href="/dashboard" />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="ml-auto rounded-md p-1.5 text-ink-muted hover:bg-elevated hover:text-ink lg:hidden"
              aria-label="Close navigation"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3" aria-label="Main">
            {nav.map((item) => {
              const active = current?.href === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] font-medium transition-colors',
                    collapsed && 'justify-center px-0',
                    active
                      ? 'bg-brand/12 text-ink'
                      : 'text-ink-muted hover:bg-elevated/70 hover:text-ink-soft',
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-brand" />
                  ) : null}
                  <span className={cn(active ? 'text-brand-soft' : 'text-ink-muted group-hover:text-ink-soft')}>
                    {item.icon}
                  </span>
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-line p-2.5">
            <Link
              href="/dashboard/settings#devices"
              className={cn(
                'flex items-center gap-2.5 rounded-[9px] px-2 py-2 text-[12px] transition-colors hover:bg-elevated/70',
                collapsed && 'justify-center',
              )}
              title="Companion status"
            >
              <span className="relative flex h-6 w-6 items-center justify-center rounded-md border border-line-strong bg-elevated">
                <IconMonitorDot online={companion.online} />
              </span>
              {!collapsed ? (
                <span className="min-w-0">
                  <span className="block truncate text-ink-soft">
                    {companion.online ? 'Companion online' : 'Companion offline'}
                  </span>
                  <span className="block truncate text-[10.5px] text-ink-muted">
                    {companion.deviceName ?? 'No device linked'}
                  </span>
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={toggleCollapsed}
              className={cn(
                'mt-1 flex w-full items-center gap-2 rounded-[9px] px-2 py-1.5 text-[11.5px] text-ink-muted transition-colors hover:bg-elevated/70 hover:text-ink-soft',
                collapsed && 'justify-center',
              )}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <IconChevronsRight className="h-3.5 w-3.5" /> : <IconChevronsLeft className="h-3.5 w-3.5" />}
              {!collapsed ? 'Collapse' : null}
            </button>
          </div>
        </aside>

        {mobileOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-ink-soft hover:bg-elevated lg:hidden"
              aria-label="Open navigation"
            >
              <IconMenu className="h-5 w-5" />
            </button>

            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="text-ink-muted">AvenqioPresence</span>
              <span className="text-ink-muted/50">/</span>
              <span className="truncate font-medium text-ink">{current?.label ?? 'Dashboard'}</span>
              {section && current && (pathname.split('/').length > 3 || pathname !== current.href) ? (
                <>
                  <span className="hidden text-ink-muted/50 sm:inline">/</span>
                  <span className="hidden truncate text-ink-muted sm:inline">
                    {pathname.split('/').length > 3 ? 'Detail' : 'Overview'}
                  </span>
                </>
              ) : null}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {communities.length > 0 ? (
                <select
                  aria-label="Select community"
                  value={activeCommunityId}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next) router.push(`/dashboard/communities/${next}`);
                  }}
                  className="hidden max-w-[180px] rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] text-ink-soft outline-none transition-colors hover:border-[#3a3350] focus-visible:border-brand md:block"
                >
                  <option value="">Select community…</option>
                  {communities.map((community) => (
                    <option key={community.id} value={community.id}>
                      {community.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <span
                className={cn(
                  'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex',
                  companion.online
                    ? 'border-success/25 bg-success/10 text-success'
                    : 'border-line-strong bg-elevated text-ink-muted',
                )}
                title={
                  companion.online
                    ? `Companion connected${companion.rpcConnected ? ' · Discord RPC ready' : ' · Discord not running'}`
                    : 'No companion heartbeat in the last 5 minutes'
                }
              >
                <span className={cn('h-1.5 w-1.5 rounded-full bg-current', companion.online && 'animate-dot')} />
                {companion.online ? 'Companion' : 'Offline'}
              </span>

              {user.isDev ? <Badge tone="warning">DEV</Badge> : null}

              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-line-strong bg-surface p-0.5 pr-2 transition-colors hover:border-[#3a3350]">
                  <Avatar src={user.avatarUrl} name={user.displayName} size={26} />
                  <span className="hidden max-w-[120px] truncate text-[12.5px] text-ink-soft sm:block">
                    {user.displayName}
                  </span>
                </summary>
                <div className="animate-fade absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line-strong bg-[#14111c] p-1.5 shadow-pop">
                  <div className="px-2 py-1.5">
                    <p className="truncate text-[13px] font-medium text-ink">{user.displayName}</p>
                    {user.username ? (
                      <p className="truncate text-[11.5px] text-ink-muted">@{user.username}</p>
                    ) : (
                      <p className="text-[11.5px] text-ink-muted">Development account</p>
                    )}
                  </div>
                  <div className="my-1 h-px bg-line" />
                  <Link
                    href="/dashboard/settings"
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-ink-soft hover:bg-elevated hover:text-ink"
                  >
                    <IconSettings className="h-4 w-4" /> Account settings
                  </Link>
                  <Link
                    href="/docs"
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-ink-soft hover:bg-elevated hover:text-ink"
                  >
                    <IconActivity className="h-4 w-4" /> Documentation
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] text-danger hover:bg-danger/10"
                  >
                    <IconLogout className="h-4 w-4" /> {signingOut ? 'Signing out…' : 'Sign out'}
                  </button>
                </div>
              </details>
            </div>
          </header>

          <main id="main" className="page-glow flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1180px]">{children}</div>
          </main>

          <footer className="border-t border-line px-4 py-4 text-[11px] text-ink-muted sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <BrandMark size={16} /> AvenqioPresence · v0.1.0
              </span>
              <span className="flex items-center gap-4">
                <Link href="/docs" className="hover:text-ink-soft">
                  Documentation
                </Link>
                <a
                  href="https://discord.gg/XPvpVG38BD"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:text-ink-soft"
                >
                  Support
                </a>
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function IconMonitorDot({ online }: { online: boolean }) {
  return (
    <span className="relative">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-soft" fill="none" stroke="currentColor" strokeWidth={1.7}>
        <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
        <path d="M8 20.5h8M12 16.5v4" strokeLinecap="round" />
      </svg>
      <span
        className={cn(
          'absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full',
          online ? 'bg-success' : 'bg-ink-muted',
        )}
      />
    </span>
  );
}
