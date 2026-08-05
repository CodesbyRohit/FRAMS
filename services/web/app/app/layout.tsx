'use client';

import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { clearAuth, getToken } from '@/lib/auth';
import { ME } from '@/lib/graphql';

const NAV = [
  { href: '/app', label: 'Twin', icon: '◈' },
  { href: '/app/copilot', label: 'Copilot', icon: '⌘' },
  { href: '/app/galaxy', label: 'Galaxy', icon: '✧' },
  { href: '/app/memory', label: 'Memory', icon: '❖' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const authenticated = !!getToken();
  const { data } = useQuery(ME, { skip: !authenticated, ssr: false });

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
    }
  }, [router]);

  function handleLogout() {
    clearAuth();
    router.replace('/login');
  }

  const person = data?.me;

  return (
    <div className="aurora-bg flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/5 bg-ink-950/70 backdrop-blur-xl lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-white/5 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-aurora-violet to-aurora-cyan text-sm font-bold text-white">
            A
          </span>
          <span className="font-display text-lg font-semibold text-white">ANIMA</span>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? 'bg-aurora-violet/15 text-white ring-1 ring-aurora-violet/30'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-4">
          {person && (
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-aurora-violet/40 to-aurora-cyan/30 text-sm font-semibold text-white">
                {person.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{person.displayName}</p>
                <p className="truncate text-xs text-slate-500">{person.email}</p>
              </div>
            </div>
          )}
          <button onClick={handleLogout} className="btn-ghost w-full !py-2 text-xs">
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/5 bg-ink-950/80 px-4 backdrop-blur-xl lg:hidden">
        <span className="font-display font-semibold text-white">ANIMA</span>
        <div className="flex gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-2.5 py-1.5 text-xs ${
                pathname === item.href ? 'bg-aurora-violet/20 text-white' : 'text-slate-500'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <main className="flex-1 px-6 pb-16 pt-20 lg:ml-60 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
