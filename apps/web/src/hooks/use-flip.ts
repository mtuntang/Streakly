"use client";

import * as React from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** The app's ease-out (globals.css `--ease-out`) and the slide time. */
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const DURATION = 280;

/** Marks this hook's animations, so a new reorder replaces only those. */
const FLIP_ID = "flip";

type Point = { x: number; y: number };

/**
 * Reads how far an element is moved on screen from its layout box, in two
 * parts: its `translate` property, and the slide this hook may be running
 * on its `transform`. CSS applies `transform` after `scale`, so a slide is
 * scaled with the element (at half size, 100px of transform moves it 50px
 * on screen); `translate` comes before `scale` and is not.
 */
function offsets(el: HTMLElement): { translate: Point; slide: Point; scale: number } {
  const style = getComputedStyle(el);
  const scale = style.scale === "none" ? 1 : parseFloat(style.scale) || 1;
  const [tx = 0, ty = 0] =
    style.translate === "none" ? [] : style.translate.split(" ").map((v) => parseFloat(v) || 0);
  const t = style.transform;
  const m = t && t !== "none" ? new DOMMatrixReadOnly(t) : null;
  return {
    translate: { x: tx, y: ty },
    slide: { x: (m?.m41 ?? 0) * scale, y: (m?.m42 ?? 0) * scale },
    scale,
  };
}

/**
 * Slides items to their new places when their order changes, instead of
 * letting them jump (the FLIP technique: note where each item was, let
 * React move it, then animate it from the old spot to the new one).
 *
 * Items are the elements under `ref` that carry `attr`, matched across
 * renders by that attribute's value. Each slide starts from where the item
 * is on screen at that moment, including partway through an earlier slide,
 * so quick reorders hand over smoothly instead of restarting from a jump.
 * Positions come from offsetLeft/offsetTop plus the container's scroll, so
 * a swipe between two reorders never reads as movement. Items may be
 * scaled (the phone deck zooms out while a pill is held). The container
 * must be the items' offset parent (positioned).
 *
 * `beforeMeasure` runs after the new order is laid out but before the
 * slides are planned. It can scroll the container (to keep a held card in
 * place on screen) or change an item's `translate`; the slides cover both.
 * A `translate` change that a CSS transition animates reads as unchanged
 * here and is left to the transition. React moves some items by taking
 * them out of the page and back, which cancels their transitions, so
 * those jump straight to the new value and the slide covers the jump.
 *
 * `order` is any string that changes when the order does, e.g. the ids
 * joined. Reduced motion and `enabled = false` skip the animation.
 */
export function useFlip(
  ref: React.RefObject<HTMLElement | null>,
  attr: string,
  order: string,
  enabled = true,
  beforeMeasure?: () => void,
) {
  const last = React.useRef(new Map<string, Point>());
  const before = React.useRef(beforeMeasure);
  React.useEffect(() => {
    before.current = beforeMeasure;
  });

  React.useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !enabled) {
      last.current.clear();
      return;
    }
    const items = Array.from(root.querySelectorAll<HTMLElement>(`[${attr}]`));

    // Where each item is on screen right now: its last layout position,
    // the scroll, its translate and whatever slide is still running on it.
    const scrollX = root.scrollLeft;
    const scrollY = root.scrollTop;
    const shown = new Map<HTMLElement, Point>();
    for (const el of items) {
      const prev = last.current.get(el.getAttribute(attr) ?? "");
      if (!prev) continue;
      const { translate, slide } = offsets(el);
      shown.set(el, {
        x: prev.x - scrollX + translate.x + slide.x,
        y: prev.y - scrollY + translate.y + slide.y,
      });
    }

    before.current?.();

    const animate = !prefersReducedMotion();
    const next = new Map<string, Point>();
    for (const el of items) {
      const id = el.getAttribute(attr);
      if (!id) continue;
      const now = { x: el.offsetLeft, y: el.offsetTop };
      next.set(id, now);
      const from = shown.get(el);
      if (!animate || !from) continue;
      // Where it would now sit without a slide, and the slide that brings
      // it there from where it was shown, in transform units for its scale.
      const { translate, scale } = offsets(el);
      const dx = (from.x - (now.x - root.scrollLeft + translate.x)) / scale;
      const dy = (from.y - (now.y - root.scrollTop + translate.y)) / scale;
      for (const old of el.getAnimations()) {
        if (old.id === FLIP_ID) old.cancel();
      }
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const slide = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: DURATION, easing: EASE_OUT },
      );
      slide.id = FLIP_ID;
    }
    last.current = next;
  }, [ref, attr, order, enabled]);
}
