"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/bugun", label: "Bugün", icon: "⌂" },
  { href: "/planim", label: "Planım", icon: "▦" },
  { href: "/arven", label: "ARVEN", icon: "✦", center: true },
  { href: "/gelisim", label: "Gelişim", icon: "▥" },
  { href: "/daha-fazla", label: "Daha Fazla", icon: "☰" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Ana navigasyon">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${active ? " active" : ""}${item.center ? " arven-center" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
