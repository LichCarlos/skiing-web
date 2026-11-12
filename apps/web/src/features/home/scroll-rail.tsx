"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowIcon } from "@/components/site-symbol";
import styles from "@/features/home/home-experience.module.css";

const STICKY_TOP = 24;
const READING_HOLD = 100;
const CARD_HOLD = 360;

/** Each card position owns a plateau; travel between plateaus eases in/out. */
export function railTimelineOffset(
  distance: number,
  stops: readonly number[],
): number {
  let cursor = 0;
  for (let i = 0; i < stops.length; i++) {
    const here = stops[i]!;
    if (distance <= cursor + CARD_HOLD) return here;
    cursor += CARD_HOLD;
    const next = stops[i + 1];
    if (next === undefined) return here;
    const length = next - here;
    if (distance < cursor + length) {
      const p = Math.max(0, (distance - cursor) / length);
      return here + length * p * p * (3 - 2 * p);
    }
    cursor += length;
  }
  return 0;
}

export function railTimelineDistance(
  offset: number,
  stops: readonly number[],
): number {
  if (!stops.length) return 0;
  let cursor = CARD_HOLD;
  for (let i = 0; i < stops.length - 1; i++) {
    const here = stops[i]!;
    const next = stops[i + 1]!;
    if (offset <= next) {
      if (offset <= here) return cursor;
      const wanted = (offset - here) / (next - here);
      let low = 0,
        high = 1;
      for (let n = 0; n < 24; n++) {
        const mid = (low + high) / 2;
        if (mid * mid * (3 - 2 * mid) < wanted) low = mid;
        else high = mid;
      }
      return cursor + ((next - here) * (low + high)) / 2;
    }
    cursor += next - here + CARD_HOLD;
  }
  return cursor;
}

export function railOffset(top: number, travel: number): number {
  return Math.max(0, Math.min(travel, STICKY_TOP - top - READING_HOLD));
}

/** Controls target the moving interval: end of entry hold / start of exit hold. */
export function railScrollTop(
  stageTop: number,
  offset: number,
  travel: number,
): number {
  return (
    stageTop - STICKY_TOP + READING_HOLD + Math.max(0, Math.min(travel, offset))
  );
}

/** Progressive enhancement: server/no-JS is a normal list, touch is native overflow. */
export function ScrollRail({
  children,
  heading,
}: {
  children: ReactNode;
  heading?: ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const viewportId = useId();

  useEffect(() => {
    const root = stage.current!;
    const view = viewport.current!;
    const items = track.current!;
    const sticky = view.parentElement!;
    const desktop = matchMedia(
      "(min-width: 1100px) and (min-height: 651px) and (hover: hover) and (pointer: fine)",
    );
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let travel = 0;
    let stops: number[] = [];
    let timeline = 0;
    let frame = 0;
    let measurementFrame = 0;
    let enhanced = false;

    function paint() {
      if (!enhanced) return;
      const offset = railTimelineOffset(
        railOffset(root.getBoundingClientRect().top, timeline),
        stops,
      );
      items.style.transform = `translate3d(${-offset}px, 0, 0)`;
      root.style.setProperty(
        "--rail-progress",
        String(travel ? offset / travel : 0),
      );
    }
    function queue() {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          paint();
        });
    }
    function measure() {
      measurementFrame = 0;
      root.dataset.ready = "true";
      // The track's width excludes the viewport's focus-ring padding. Using
      // view.clientWidth here leaves the last card clipped by that padding.
      travel = Math.max(0, items.scrollWidth - items.clientWidth);
      stops = [
        ...new Set([
          0,
          ...Array.from(items.children, (item) =>
            Math.min(
              travel,
              Math.max(
                0,
                item.getBoundingClientRect().left -
                  items.getBoundingClientRect().left,
              ),
            ),
          ),
          travel,
        ]),
      ].sort((a, b) => a - b);
      timeline = travel + stops.length * CARD_HOLD;
      root.dataset.stops = stops.join(",");
      enhanced = desktop.matches && !motion.matches && travel > 0;
      if (enhanced) {
        // Measure the final sticky layout, including its progress bar. Neither
        // this panel nor the track derives its size from the stage's height.
        root.dataset.enhanced = "true";
        enhanced = sticky.offsetHeight <= innerHeight - 40;
      }
      if (enhanced) {
        view.scrollLeft = 0;
        root.style.height = `${sticky.offsetHeight + timeline + READING_HOLD * 2}px`;
      } else {
        delete root.dataset.enhanced;
        items.style.removeProperty("transform");
        root.style.removeProperty("height");
        root.style.removeProperty("--rail-progress");
      }
      queue();
    }
    function queueMeasure() {
      if (!measurementFrame) measurementFrame = requestAnimationFrame(measure);
    }
    function focus(event: FocusEvent) {
      if (!enhanced || !(event.target instanceof HTMLElement)) return;
      const target = event.target.getBoundingClientRect();
      const bounds = view.getBoundingClientRect();
      if (target.left >= bounds.left && target.right <= bounds.right) return;
      const current = railTimelineOffset(
        railOffset(root.getBoundingClientRect().top, timeline),
        stops,
      );
      const delta =
        target.left < bounds.left
          ? target.left - bounds.left - 12
          : target.right - bounds.right + 12;
      const offset = Math.max(0, Math.min(travel, current + delta));
      // Native focus scrolling must not compete with the transformed track.
      view.scrollLeft = 0;
      window.scrollTo({
        top: railScrollTop(
          scrollY + root.getBoundingClientRect().top,
          railTimelineDistance(offset, stops),
          timeline,
        ),
        behavior: "instant",
      });
      paint();
    }
    // Observe content, never the stage whose height this effect changes.
    const observer = new ResizeObserver(queueMeasure);
    observer.observe(view);
    observer.observe(items);
    observer.observe(sticky);
    desktop.addEventListener("change", queueMeasure);
    motion.addEventListener("change", queueMeasure);
    window.addEventListener("resize", queueMeasure);
    window.addEventListener("scroll", queue, { passive: true });
    view.addEventListener("focusin", focus);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(measurementFrame);
      observer.disconnect();
      desktop.removeEventListener("change", queueMeasure);
      motion.removeEventListener("change", queueMeasure);
      window.removeEventListener("resize", queueMeasure);
      window.removeEventListener("scroll", queue);
      view.removeEventListener("focusin", focus);
      delete root.dataset.ready;
      delete root.dataset.enhanced;
      delete root.dataset.stops;
      root.style.removeProperty("height");
      root.style.removeProperty("--rail-progress");
      items.style.removeProperty("transform");
    };
  }, []);

  function step(direction: number) {
    const root = stage.current!;
    const view = viewport.current!;
    const items = track.current!;
    const distance = Math.min(view.clientWidth * 0.8, 440);
    if (root.dataset.enhanced) {
      const travel = Math.max(0, items.scrollWidth - items.clientWidth);
      const stops = (root.dataset.stops ?? "0").split(",").map(Number);
      const timeline = travel + stops.length * CARD_HOLD;
      const offset = railTimelineOffset(
        railOffset(root.getBoundingClientRect().top, timeline),
        stops,
      );
      const next = Math.max(0, Math.min(travel, offset + distance * direction));
      // At either endpoint, leave the reader's position within the hold alone.
      if (next === offset) return;
      window.scrollTo({
        top: railScrollTop(
          scrollY + root.getBoundingClientRect().top,
          railTimelineDistance(next, stops),
          timeline,
        ),
        behavior: "smooth",
      });
    } else {
      view.scrollBy({
        left: distance * direction,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  }

  return (
    <div ref={stage} className={styles.railStage} data-scroll-rail>
      <div className={styles.railSticky}>
        {heading}
        <div className={styles.railToolbar}>
          <span>循着雪迹，找到下一站</span>
          <div className={styles.railControls}>
            <button
              aria-label="向前浏览雪场"
              aria-controls={viewportId}
              onClick={() => step(-1)}
            >
              <ArrowIcon direction="left" />
            </button>
            <button
              aria-label="向后浏览雪场"
              aria-controls={viewportId}
              onClick={() => step(1)}
            >
              <ArrowIcon />
            </button>
          </div>
        </div>
        <div ref={viewport} id={viewportId} className={styles.railViewport}>
          <div ref={track} className={styles.railTrack}>
            {children}
          </div>
        </div>
        <div className={styles.railProgress} aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
