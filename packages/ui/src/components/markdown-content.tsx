import { inspectMarkdown } from "../lib/markdown-source";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./markdown-content.module.css";

export function safeContentUrl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 32 || code === 127 || code === 92) return false;
  }
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** Presentation only: callers supply entity routes and already-authorized images. */
export function MarkdownContent({
  source,
  format,
  images = {},
  resolveLink,
  className,
}: {
  source: string;
  format?: string;
  images?: Readonly<Record<string, string>>;
  resolveLink?: (logicalUrl: string) => string | undefined;
  className?: string;
}) {
  if (format !== "markdown_v1")
    return <div className={`${styles.plain} ${className ?? ""}`}>{source}</div>;
  const link = (url: string) => {
    if (safeContentUrl(url)) return url;
    const resolved = resolveLink?.(url);
    return resolved &&
      (safeContentUrl(resolved) || /^\/(?!\/)[^\s\\]*$/.test(resolved))
      ? resolved
      : "";
  };
  const issue = inspectMarkdown(source, {
    image: (url) =>
      /^asset:[1-9]\d{0,18}$/.test(url) &&
      BigInt(url.slice(6)) <= 9223372036854775807n,
    // Links are rendered through the sanitizer below; an unresolved route stays text, not a whole-document fallback.
    link: () => true,
  });
  if (issue)
    return <div className={`${styles.plain} ${className ?? ""}`}>{source}</div>;
  return (
    <div className={`${styles.content} ${className ?? ""}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url, key) => (key === "src" ? url : link(url))}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a
                href={href}
                rel="noopener noreferrer"
                target={/^https?:/.test(href) ? "_blank" : undefined}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) => {
            const url = typeof src === "string" ? images[src] : undefined;
            return url && safeContentUrl(url) ? (
              <img src={url} alt={alt ?? ""} loading="lazy" />
            ) : (
              <span
                className={styles.missingImage}
                role="img"
                aria-label={alt || "图片不可用"}
              >
                图片不可用，请刷新文章或重新上传
              </span>
            );
          },
          table: ({ children }) => (
            <div
              className={styles.tableScroll}
              tabIndex={0}
              role="region"
              aria-label="文章表格"
            >
              <table>{children}</table>
            </div>
          ),
          input: ({ checked }) => (
            <input
              type="checkbox"
              disabled
              checked={checked ?? false}
              readOnly
            />
          ),
        }}
      >
        {source}
      </Markdown>
    </div>
  );
}
