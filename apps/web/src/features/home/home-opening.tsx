"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { SnowMark } from "@/components/snow-mark";
import { ArrowIcon } from "@/components/site-symbol";
import { sloganPixels } from "@/features/home/slogan-pixels";
import styles from "@/features/home/home-opening.module.css";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function openingFrame(progress: number) {
  const p = clamp(progress);
  const phrase = p < 0.36 ? 0 : 1;
  const cover =
    p < 0.36
      ? clamp((p - 0.18) / 0.14)
      : p < 0.56
        ? 1 - clamp((p - 0.4) / 0.14)
        : p < 0.76
          ? clamp((p - 0.6) / 0.12)
          : 1 - clamp((p - 0.76) / 0.06);
  return {
    first: phrase === 0 ? 1 : 0,
    second: phrase === 1 && p < 0.74 ? 1 : 0,
    cover,
    mountain: clamp((p - 0.84) / 0.1),
    scene:
      p < 0.36
        ? "forward"
        : p < 0.74
          ? "mountainward"
          : p < 0.84
            ? "grid"
            : "mountain",
  };
}
// Clearing whole grid cells uncovers the pixel-built glyphs beneath them.
const covers = Array.from({ length: 20 }, (_, bucket) => {
  let path = "";
  for (let y = 4; y < 20; y++)
    for (let x = 1; x < 59; x++) {
      // Mix low bits too, so the five colors do not form a checkerboard.
      let hash = (x * 73856093) ^ (y * 19349663);
      hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
      hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
      hash = (hash ^ (hash >>> 16)) >>> 0;
      if (hash % 20 === bucket) path += `M${x},${y}h1v1h-1z`;
    }
  return path;
});

export function HomeOpening({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const showcase = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = stage.current!;
    const view = canvas.current!;
    const content = showcase.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = matchMedia("(min-width: 1100px) and (min-height: 651px)");
    const tiles = Array.from(
      root.querySelectorAll<SVGPathElement>("[data-opening-tile]"),
    );
    let frame = 0;
    function paint() {
      frame = 0;
      if (reduced.matches || !desktop.matches) {
        delete root.dataset.enhanced;
        delete root.dataset.scene;
        root.removeAttribute("style");
        content.inert = false;
        content.removeAttribute("aria-hidden");
        return;
      }
      root.dataset.enhanced = "true";
      const top = parseFloat(getComputedStyle(view).top) || 0;
      const travel = Math.max(1, root.offsetHeight - view.offsetHeight - 200);
      const p = clamp((top - root.getBoundingClientRect().top - 100) / travel);
      const state = openingFrame(p);
      const cell = view.clientWidth / 60;
      root.style.setProperty("--opening-cell", `${cell}px`);
      root.style.setProperty(
        "--opening-type-top",
        `${Math.floor(view.clientHeight / cell / 2 - 12) * cell}px`,
      );
      root.style.setProperty("--opening-first", String(state.first));
      root.style.setProperty("--opening-second", String(state.second));
      root.style.setProperty("--opening-reveal", String(state.mountain));
      root.style.setProperty(
        "--opening-inset",
        `${(1 - state.mountain) * 50}%`,
      );
      root.style.setProperty("--opening-grid", String(1 - state.mountain));
      root.dataset.scene = state.scene;
      for (const tile of tiles) {
        const threshold = (Number(tile.dataset.openingTile) + 1) / 20;
        tile.toggleAttribute(
          "data-covered",
          state.cover >= threshold - 0.00001,
        );
      }
      content.inert = state.mountain < 1;
      if (content.inert) content.setAttribute("aria-hidden", "true");
      else content.removeAttribute("aria-hidden");
    }
    function queue() {
      if (!frame) frame = requestAnimationFrame(paint);
    }
    const observer = new ResizeObserver(queue);
    observer.observe(root);
    observer.observe(view);
    reduced.addEventListener("change", queue);
    desktop.addEventListener("change", queue);
    window.addEventListener("resize", queue);
    window.addEventListener("scroll", queue, { passive: true });
    paint();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reduced.removeEventListener("change", queue);
      desktop.removeEventListener("change", queue);
      window.removeEventListener("resize", queue);
      window.removeEventListener("scroll", queue);
      content.inert = false;
      content.removeAttribute("aria-hidden");
      delete root.dataset.enhanced;
      delete root.dataset.scene;
      root.removeAttribute("style");
    };
  }, []);
  return (
    <section
      ref={stage}
      className={styles.stage}
      data-home-opening
      aria-labelledby="opening-title"
    >
      <div ref={canvas} className={styles.canvas}>
        <div className={styles.poster}>
          <h1 id="opening-title" className={styles.title}>
            <span>生活向前，</span>
            <span>快乐向山。</span>
          </h1>
          <svg
            className={styles.pixels}
            viewBox="0 0 60 24"
            aria-hidden="true"
            shapeRendering="crispEdges"
          >
            {sloganPixels.map((groups, phrase) => (
              <path
                key={phrase}
                className={styles.glyph}
                data-phrase={phrase}
                fill="currentColor"
                d={groups.join("")}
              />
            ))}
            {covers.map((path, bucket) => (
              <path
                key={bucket}
                d={path}
                className={styles.tile}
                data-opening-tile={bucket}
                data-tone={
                  ["red", "yellow", "blue", "green", "purple"][bucket % 5]
                }
              />
            ))}
          </svg>
          <SnowMark className={styles.snow} />
          <div className={styles.prompt}>
            <span>向下滚动，向山出发</span>
            <ArrowIcon direction="down" />
          </div>
        </div>
        <div ref={showcase} className={styles.showcase}>
          {children}
        </div>
      </div>
    </section>
  );
}
