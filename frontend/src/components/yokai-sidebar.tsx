"use client";

import Link from "next/link";
import {
  Boxes,
  CircleDollarSign,
  FileImage,
  Gauge,
  LogOut,
  Settings,
  ShoppingBag,
  Users,
  WandSparkles,
  Zap,
} from "lucide-react";

type Props = {
  activePath: string;
  actionLabel?: string;
  actionHref?: string;
};

const NAV = [
  { label: "Dashboard", href: "/", icon: Gauge },
  { label: "Produkcja", href: "/production", icon: Zap },
  { label: "Zamówienia", href: "/orders", icon: ShoppingBag },
  { label: "Biblioteka SVG", href: "/library", icon: FileImage },
  { label: "Kalkulator", href: "/calculator", icon: CircleDollarSign },
  { label: "Materiały", href: "/materials", icon: Boxes },
  { label: "Klienci", href: "/clients", icon: Users },
  { label: "Finanse", href: "/finance", icon: CircleDollarSign },
  { label: "AI Studio", href: "/ai-studio", icon: WandSparkles },
];

export function YokaiSidebar({
  activePath,
  actionLabel,
  actionHref,
}: Props) {
  const logout = () => {
    localStorage.removeItem("yokai_token");
    window.location.href = "/login";
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] border-r border-white/[.055] bg-[#0b0f15] lg:flex lg:flex-col">
      <div className="flex items-center gap-3 px-5 pb-5 pt-5">
        <div className="relative grid size-10 shrink-0 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/[.08] text-lg font-semibold">
          Y
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,.8)]" />
        </div>

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-[.16em] text-white">
            YOKAI OS
          </div>
          <div className="mt-1 truncate text-[9px] font-medium tracking-[.18em] text-white/25">
            WRAP INTELLIGENCE
          </div>
        </div>
      </div>

      {actionLabel && actionHref && (
        <div className="px-3 pb-4">
          <Link
            href={actionHref}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(124,58,237,.22)] transition hover:brightness-110"
          >
            <span className="text-lg leading-none">+</span>
            {actionLabel}
          </Link>
        </div>
      )}

      <nav className="space-y-1 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? activePath === "/"
              : activePath.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                active
                  ? "border-violet-400/20 bg-violet-500/[.10] font-medium text-white"
                  : "border-transparent text-white/42 hover:bg-white/[.035] hover:text-white/75"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
              {active && (
                <span className="ml-auto size-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,.7)]" />
              )}
            </Link>
          );
        })}

        <div className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm text-white/28">
          <Settings className="size-4 shrink-0" />
          <span>Ustawienia</span>
        </div>
      </nav>

      <div className="mt-auto p-3">
        <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-3">
          <div className="text-xs font-medium text-white/65">YOKAI WRAP</div>
          <div className="mt-1 text-[10px] text-white/25">Panel prywatny</div>
        </div>

        <button
          onClick={logout}
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/35 transition hover:bg-white/[.03] hover:text-white/70"
        >
          <LogOut className="size-4" />
          Wyloguj
        </button>
      </div>
    </aside>
  );
}
