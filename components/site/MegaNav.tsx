"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavSection } from "@/lib/site/nav";

/** Small blue square with an arrow, as in the reference menus. */
export function ArrowBox({ large = false }: { large?: boolean }) {
  return (
    <span className={large ? "nav-arrowbox lg" : "nav-arrowbox"} aria-hidden="true">
      <span className="ms">arrow_forward</span>
    </span>
  );
}

/**
 * Desktop menu: each section opens a full-width panel on hover (or click /
 * keyboard) with its title, sub-links and up to two picture cards.
 */
export function MegaNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenKey(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenKey(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [openKey]);

  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  };
  // A short delay so moving the pointer from the item down to the panel
  // doesn't close it.
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpenKey(null), 160);
  };

  const inSection = (section: NavSection) =>
    pathname === section.href || pathname.startsWith(`${section.href}/`);
  const open = sections.find((section) => section.key === openKey) ?? null;

  return (
    <div className="mega" ref={rootRef} onMouseLeave={closeSoon} onMouseEnter={cancelClose}>
      <nav aria-label="Main" className="mega-bar">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            className={["mega-item", openKey === section.key ? "open" : "", inSection(section) ? "here" : ""]
              .filter(Boolean)
              .join(" ")}
            aria-expanded={openKey === section.key}
            aria-controls={`mega-${section.key}`}
            onMouseEnter={() => {
              cancelClose();
              setOpenKey(section.key);
            }}
            onClick={() => setOpenKey(openKey === section.key ? null : section.key)}
          >
            {section.label}
            <span className="ms" aria-hidden="true">
              expand_more
            </span>
          </button>
        ))}
      </nav>

      {open ? (
        <div id={`mega-${open.key}`} className="mega-panel" role="region" aria-label={open.label}>
          <div className="wrap mega-inner">
            <Link href={open.href} className="mega-title" onClick={() => setOpenKey(null)}>
              {open.label}
              <ArrowBox large />
            </Link>
            <div className="mega-body">
              <ul className="mega-links">
                {open.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} onClick={() => setOpenKey(null)}>
                      <span>{link.label}</span>
                      <ArrowBox />
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mega-cards">
                {open.cards.map((card) => (
                  <Link key={card.href + card.label} href={card.href} className="mega-card" onClick={() => setOpenKey(null)}>
                    <span className="mega-card-label">
                      {card.label}
                      <ArrowBox />
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element -- static illustration */}
                    <img src={card.image} alt="" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
