"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowIcon, CrossIcon } from "@/components/site-symbol";
import styles from "@/features/public-content/photo-gallery.module.css";

export function galleryPosition(index: number, length: number): number {
  return Math.max(0, Math.min(Math.max(0, length - 1), index));
}

/** Public, already-authorized URLs only. No new asset lookup or URL persistence. */
export function PhotoGallery({
  urls,
  label,
}: {
  urls: string[];
  label: string;
}) {
  const pictures = urls.filter(Boolean);
  const [current, setCurrent] = useState(0);
  const [opened, setOpened] = useState<number | null>(null);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const track = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement | null>(null);
  const id = useId();
  const active = galleryPosition(current, pictures.length);
  const enlarged = galleryPosition(opened ?? 0, pictures.length);
  const viewing = opened !== null;
  useEffect(() => {
    if (!viewing) return;
    const original = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = original;
    };
  }, [viewing]);
  if (!pictures.length) return null;

  function move(index: number) {
    const next = galleryPosition(index, pictures.length);
    const view = track.current;
    const item = view?.children[next] as HTMLElement | undefined;
    if (view && item) {
      view.scrollTo({
        left: item.offsetLeft - (view.children[0] as HTMLElement).offsetLeft,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  }

  return (
    <section className={styles.gallery} aria-label={label} data-photo-gallery>
      <div className={styles.toolbar}>
        <p>左右滑动浏览，点击查看大图</p>
        <div className={styles.controls} data-gallery-controls>
          <span aria-live="polite" aria-atomic="true">
            {active + 1} / {pictures.length}
          </span>
          {pictures.length > 1 && (
            <>
              <button
                type="button"
                aria-label="上一张照片"
                aria-controls={id}
                disabled={active === 0}
                onClick={() => move(active - 1)}
              >
                <ArrowIcon direction="left" />
              </button>
              <button
                type="button"
                aria-label="下一张照片"
                aria-controls={id}
                disabled={active === pictures.length - 1}
                onClick={() => move(active + 1)}
              >
                <ArrowIcon />
              </button>
            </>
          )}
        </div>
      </div>
      <div
        ref={track}
        id={id}
        className={styles.track}
        onScroll={() => {
          const view = track.current;
          if (!view) return;
          const start = (view.children[0] as HTMLElement)?.offsetLeft ?? 0;
          let nearest = 0;
          let distance = Infinity;
          Array.from(view.children).forEach((child, index) => {
            const gap = Math.abs(
              (child as HTMLElement).offsetLeft - start - view.scrollLeft,
            );
            if (gap < distance) {
              nearest = index;
              distance = gap;
            }
          });
          setCurrent(nearest);
        }}
      >
        {pictures.map((url, index) => (
          <figure className={styles.slide} key={`${url}-${index}`}>
            <a
              className={styles.image}
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={`放大${label}第 ${index + 1} 张`}
              onClick={(event) => {
                if (
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                if (!dialog.current?.showModal) return;
                event.preventDefault();
                trigger.current = event.currentTarget;
                setOpened(index);
                dialog.current.showModal();
              }}
            >
              <Image
                src={url}
                alt={`${label} ${index + 1}`}
                fill
                unoptimized
                sizes="(max-width: 760px) 85vw, 640px"
                onError={() =>
                  setFailed((previous) => ({ ...previous, [url]: true }))
                }
              />
            </a>
            <figcaption>
              {failed[url]
                ? "图片暂时无法读取，可重新读取页面"
                : `${label} ${index + 1}`}
            </figcaption>
          </figure>
        ))}
      </div>
      {Object.keys(failed).length > 0 && (
        <button
          className={styles.reload}
          type="button"
          onClick={() => window.location.reload()}
        >
          重新读取页面图片
        </button>
      )}
      <dialog
        ref={dialog}
        className={styles.viewer}
        aria-label={`${label}大图浏览`}
        onClose={() => {
          setOpened(null);
          trigger.current?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            setOpened(
              galleryPosition(
                enlarged + (event.key === "ArrowRight" ? 1 : -1),
                pictures.length,
              ),
            );
          }
          if (event.key === "Tab") {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            );
            const first = buttons[0];
            const last = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className={styles.viewerTop}>
          <span aria-live="polite" aria-atomic="true">
            {label} · {enlarged + 1} / {pictures.length}
          </span>
          <button
            type="button"
            aria-label="关闭大图"
            onClick={() => dialog.current?.close()}
          >
            <CrossIcon close />
          </button>
        </div>
        {opened !== null && (
          <div className={styles.fullImage}>
            <Image
              src={pictures[enlarged]!}
              alt={`${label} ${enlarged + 1}`}
              fill
              unoptimized
              sizes="95vw"
              onError={() =>
                setFailed((previous) => ({
                  ...previous,
                  [pictures[enlarged]!]: true,
                }))
              }
            />
          </div>
        )}
        {failed[pictures[enlarged]!] && (
          <p role="status">
            图片链接可能已过期，请关闭大图后重新读取页面图片。
          </p>
        )}
        {pictures.length > 1 && (
          <div className={styles.viewerControls}>
            <button
              type="button"
              disabled={enlarged === 0}
              onClick={() => setOpened(enlarged - 1)}
            >
              上一张
            </button>
            <span>也可使用键盘左右方向键</span>
            <button
              type="button"
              disabled={enlarged === pictures.length - 1}
              onClick={() => setOpened(enlarged + 1)}
            >
              下一张
            </button>
          </div>
        )}
      </dialog>
    </section>
  );
}
