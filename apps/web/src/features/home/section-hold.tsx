"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "@/features/home/section-hold.module.css";

/**
 * Wrap a complete knowledge/community section. A fitting panel has a continuous
 * A viewport-sized native sticky dwell gives each complete panel a reading beat.
 * Tall panels keep normal flow with 100px breathing space at each end so their
 * entire contents stay readable, without pinning content below the viewport.
 */
export function SectionHold({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = stage.current!;
    const content = panel.current!;
    const desktop = matchMedia(
      "(min-width: 1100px) and (min-height: 651px) and (hover: hover) and (pointer: fine)",
    );
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    function measure() {
      frame = 0;
      // The panel's natural height never depends on the stage height we write.
      // Observe only the panel, avoiding a stage-height ResizeObserver loop.
      const height = content.getBoundingClientRect().height;
      if (desktop.matches && !reduced.matches && height > 0) {
        if (height <= innerHeight - 40) {
          delete root.dataset.tall;
          const dwell = Math.max(520, innerHeight * 0.85);
          root.style.setProperty(
            "--section-hold-height",
            `${height + dwell + 40}px`,
          );
          root.dataset.enhanced = "true";
        } else {
          delete root.dataset.enhanced;
          root.style.removeProperty("--section-hold-height");
          root.dataset.tall = "true";
        }
      } else {
        delete root.dataset.enhanced;
        delete root.dataset.tall;
        root.style.removeProperty("--section-hold-height");
      }
    }
    function queue() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    const observer = new ResizeObserver(queue);
    observer.observe(content);
    desktop.addEventListener("change", queue);
    reduced.addEventListener("change", queue);
    window.addEventListener("resize", queue);
    queue();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      desktop.removeEventListener("change", queue);
      reduced.removeEventListener("change", queue);
      window.removeEventListener("resize", queue);
      delete root.dataset.enhanced;
      delete root.dataset.tall;
      root.style.removeProperty("--section-hold-height");
    };
  }, []);

  return (
    <div ref={stage} className={styles.stage} data-section-hold>
      <div ref={panel} className={styles.panel}>
        {children}
      </div>
    </div>
  );
}
