"use client";

import { createElement, useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./Reveal.module.css";

type Tag = "div" | "li" | "section" | "p" | "figure";

export interface RevealProps {
  children: ReactNode;
  as?: Tag;
  delay?: number;
  className?: string;
}

/**
 * Fades and lifts content in as it scrolls into view. Content is visible by
 * default; it only hides (and then reveals) when it starts below the fold, so
 * nothing is ever stuck invisible if scripting or IntersectionObserver is absent.
 */
export default function Reveal({ children, as = "div", delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"visible" | "hidden" | "shown">("visible");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("shown");
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return createElement(
    as,
    {
      ref,
      className: `${styles.reveal} ${state === "hidden" ? styles.hidden : ""} ${className ?? ""}`,
      style: { transitionDelay: state === "shown" ? `${delay}ms` : undefined },
    },
    children,
  );
}
