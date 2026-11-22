import type React from "react";
import { useLayoutEffect, useState } from "react";
import { prefersReducedMotion } from "./viewTransitions";

let leaving: { page: string; node: HTMLElement; rect: DOMRect } | null = null;

// make one per page at module scope so React keeps the same ref
export const skeletonRef =
  (page: string) => (node: HTMLElement | null) => () => {
    if (!node) return;
    // refs detach before the node leaves the DOM, so it still has its box
    leaving = { page, node, rect: node.getBoundingClientRect() };
    queueMicrotask(() => {
      leaving = null;
    });
  };

export function useSkeletonCrossfade(page: string) {
  useLayoutEffect(() => {
    if (leaving?.page !== page) return;
    const { node, rect } = leaving;
    leaving = null;
    if (prefersReducedMotion()) return;
    const ghost = node.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("role");
    ghost.removeAttribute("aria-busy");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    Object.assign(ghost.style, {
      position: "fixed",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
    });
    ghost.classList.add("skeleton-ghost");
    const done = (e: AnimationEvent) => {
      if (e.target === ghost) ghost.remove();
    };
    ghost.addEventListener("animationend", done);
    ghost.addEventListener("animationcancel", done);
    document.body.append(ghost);
  });
}

// pass className and onAnimationEnd so a later remount doesn't replay
export function useSkeletonFadeIn(loading: boolean) {
  const [waited, setWaited] = useState(loading);
  if (loading && !waited) setWaited(true);
  return {
    className:
      waited && !loading
        ? "motion-safe:animate-[fade-in_var(--d-2)_var(--e-out)]"
        : "",
    onAnimationEnd: (e: React.AnimationEvent) => {
      if (e.target === e.currentTarget) setWaited(false);
    },
  };
}
