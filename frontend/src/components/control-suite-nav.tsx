"use client";

import Link from "next/link";
import {
  Bell,
  FileBarChart,
  HeartPulse,
  Settings,
} from "lucide-react";

const ITEMS = [
  {
    href: "/settings",
    label: "Ustawienia",
    icon: Settings,
  },
  {
    href: "/notifications",
    label: "Powiadomienia",
    icon: Bell,
  },
  {
    href: "/system",
    label: "System",
    icon: HeartPulse,
  },
  {
    href: "/reports",
    label: "Raporty",
    icon: FileBarChart,
  },
];

export function ControlSuiteNav({
  active,
}: {
  active: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const selected =
          active === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm transition ${
              selected
                ? "border-violet-400/25 bg-violet-500/[.10] text-white"
                : "border-white/[.07] bg-white/[.02] text-white/45 hover:text-white/75"
            }`}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
