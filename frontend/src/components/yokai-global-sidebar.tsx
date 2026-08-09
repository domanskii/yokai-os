"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function YokaiGlobalSidebar() {
  const pathname = usePathname() || "/";

  if (
    pathname.startsWith("/login")
  ) {
    return null;
  }

  const logout = () => {
    localStorage.removeItem(
      "yokai_token"
    );
    window.location.href =
      "/login";
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-[80] hidden w-[250px] flex-col border-r border-white/[.055] bg-[#090d13] lg:flex">
      <div className="flex items-center gap-3 px-[15px] pb-5 pt-[14px]">
        <div className="relative grid size-10 shrink-0 place-items-center rounded-2xl border border-violet-400/30 bg-violet-500/[.08] text-[18px] font-bold text-white">
          Y
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,.85)]" />
        </div>

        <div className="min-w-0">
          <div className="truncate text-[14px] font-extrabold tracking-[.16em] text-white">
            YOKAI OS
          </div>

          <div className="mt-[3px] truncate text-[9px] font-semibold tracking-[.18em] text-white/25">
            WRAP INTELLIGENCE
          </div>
        </div>
      </div>

      <div className="px-3 pb-[14px]">
        <Link
          href="/orders"
          className="flex h-[42px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 text-[13px] font-bold text-white shadow-[0_8px_28px_rgba(124,58,237,.22)] transition hover:brightness-110"
        >
          <span className="text-[18px] font-light leading-none">
            +
          </span>
          Nowe zamówienie
        </Link>
      </div>

      <nav className="space-y-[3px] px-3">
        {NAV.map((item) => {
          const Icon =
            item.icon;

          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(
                  item.href
                );

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-[43px] items-center gap-3 rounded-xl border px-3 text-[13px] transition ${
                active
                  ? "border-violet-400/25 bg-violet-500/[.10] font-bold text-white"
                  : "border-transparent font-semibold text-white/38 hover:bg-white/[.035] hover:text-white/75"
              }`}
            >
              <Icon className="size-[16px] shrink-0" />

              <span>
                {item.label}
              </span>

              {active && (
                <span className="ml-auto size-1.5 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" />
              )}
            </Link>
          );
        })}

        <Link
          href="/settings"
          className="flex h-[43px] items-center gap-3 rounded-xl border border-transparent px-3 text-[13px] font-semibold text-white/32"
        >
          <Settings className="size-[16px] shrink-0" />
          <span>Ustawienia</span>
        </Link>
      </nav>

      <div className="mt-auto p-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-[#11161d] p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-600 text-[12px] font-bold text-white">
            E
          </div>

          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-white/80">
              Emil
            </div>

            <div className="mt-0.5 truncate text-[10px] text-white/28">
              kontakt@yokaiwrap.pl
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="mt-2 flex h-[40px] w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-white/38 transition hover:bg-white/[.03] hover:text-white/72"
        >
          <LogOut className="size-[16px]" />
          Wyloguj
        </button>
      </div>
    </aside>
  );
}
