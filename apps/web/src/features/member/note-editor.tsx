"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { inspectMarkdown, MarkdownContent } from "@common/ui";
import { noteEditorExtensions } from "@/features/member/editor-schema";
import {
  allowedArticleLink,
  articleAssetReference,
  plainTextDocument,
} from "@/features/member/content-links";
import { getPageHref } from "@/platform/config";
import { routes } from "@/config/routes";
import styles from "@/features/member/member.module.css";

export type NoteImage = { assetId: string; url: string };
type Props = {
  value: string;
  format: "plain_text" | "markdown_v1";
  images: NoteImage[];
  onChange(value: string): void;
  onFormatChange(format: "markdown_v1"): void;
  disabled: boolean;
  canUpload: boolean;
  upload(file: File): Promise<NoteImage>;
  onImage(image: NoteImage): void;
};
export function NoteEditor(props: Props) {
  const [mode, setMode] = useState<"write" | "preview" | "source">("write");
  const [issue, setIssue] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false),
    [linkText, setLinkText] = useState(""),
    [linkUrl, setLinkUrl] = useState("");
  const input = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const urls = useRef<Record<string, string>>({});
  urls.current = Object.fromEntries(
    props.images.map((x) => [`asset:${x.assetId}`, x.url]),
  );
  const [extensions] = useState(() =>
    noteEditorExtensions((reference) => urls.current[reference]),
  );
  const [, redraw] = useState(0);
  const invalid =
    props.format === "markdown_v1"
      ? inspectMarkdown(props.value, {
          image: articleAssetReference,
          link: allowedArticleLink,
        })
      : null;
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content:
      props.format === "markdown_v1"
        ? invalid
          ? ""
          : props.value
        : plainTextDocument(props.value),
    contentType: props.format === "markdown_v1" ? "markdown" : "json",
    editorProps: {
      attributes: {
        "aria-label": "笔记富文本正文",
        role: "textbox",
        "aria-multiline": "true",
        "data-placeholder": "从一个标题开始，记录你的雪上故事…",
      },
      handlePaste(view, event) {
        if (event.clipboardData?.files.length) {
          setIssue("请使用插入图片按钮上传文件。");
          return true;
        }
        if (event.clipboardData?.getData("text/html")) {
          view.pasteText(event.clipboardData.getData("text/plain"));
          return true;
        }
        return false;
      },
      handleDrop(_view, event) {
        if (event.dataTransfer?.files.length) {
          setIssue("请使用插入图片按钮上传文件。");
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      latest.current.onChange(editor.getMarkdown());
      redraw((n) => n + 1);
    },
    onSelectionUpdate() {
      redraw((n) => n + 1);
    },
  });
  const busy = props.disabled || uploading;
  useEffect(() => {
    editor?.setEditable(
      !busy && props.format === "markdown_v1" && !invalid,
      false,
    );
  }, [editor, busy, props.format, invalid]);
  useEffect(() => {
    if (
      editor &&
      props.format === "markdown_v1" &&
      !invalid &&
      editor.getMarkdown() !== props.value
    )
      editor.commands.setContent(props.value, {
        contentType: "markdown",
        emitUpdate: false,
      });
  }, [editor, props.value, props.format, invalid]);
  function exportNote() {
    const url = URL.createObjectURL(
      new Blob([props.value], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "我的滑雪笔记.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function upload(file: File) {
    if (busy || !editor) return;
    setUploading(true);
    setIssue(null);
    try {
      const image = await props.upload(file);
      if (editor.isDestroyed || latest.current.disabled) return;
      urls.current[`asset:${image.assetId}`] = image.url;
      latest.current.onImage(image);
      // Keep block images outside table cells; Markdown tables cannot contain blocks.
      editor
        .chain()
        .focus()
        .insertContentAt(editor.state.doc.content.size, {
          type: "image",
          attrs: {
            src: `asset:${image.assetId}`,
            alt: file.name.replace(/[\[\]\\]/g, ""),
          },
        })
        .run();
    } catch (error) {
      if (!editor.isDestroyed)
        setIssue(
          error instanceof Error ? error.message : "上传失败，请核对图片状态。",
        );
    } finally {
      if (!editor.isDestroyed) setUploading(false);
    }
  }
  async function importFile(file: File) {
    if (busy || !editor) return;
    if (!/\.md$/i.test(file.name) || file.size > 40000) {
      setIssue("请选择不超过 40 KB 的 .md 文件，正文最多 10000 字符。");
      return;
    }
    const source = (await file.text())
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n");
    if (editor.isDestroyed || latest.current.disabled) return;
    const problem =
      source.length > 10000
        ? "正文最多 10000 字符。"
        : inspectMarkdown(source, {
            image: (src) =>
              articleAssetReference(src) &&
              latest.current.images.some((x) => src === `asset:${x.assetId}`),
            link: allowedArticleLink,
          });
    if (problem) {
      setIssue(problem);
      return;
    }
    if (
      props.value.trim() &&
      !window.confirm("用导入的文件替换当前正文？可先导出保留当前版本。")
    )
      return;
    latest.current.onFormatChange("markdown_v1");
    latest.current.onChange(source);
    setMode("write");
    setIssue(null);
  }
  const commands = [
    {
      label: "正文",
      active: editor?.isActive("paragraph"),
      action: () => editor?.chain().focus().setParagraph().run(),
    },
    ...([1, 2, 3] as const).map((level) => ({
      label: `标题 ${level}`,
      active: editor?.isActive("heading", { level }),
      action: () => editor?.chain().focus().toggleHeading({ level }).run(),
    })),
    {
      label: "粗体",
      active: editor?.isActive("bold"),
      action: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: "斜体",
      active: editor?.isActive("italic"),
      action: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: "列表",
      active: editor?.isActive("bulletList"),
      action: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: "有序列表",
      active: editor?.isActive("orderedList"),
      action: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "引用",
      active: editor?.isActive("blockquote"),
      action: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "代码",
      active: editor?.isActive("codeBlock"),
      action: () => editor?.chain().focus().toggleCodeBlock().run(),
    },
  ];
  return (
    <section className={styles.editor} aria-label="笔记编辑器" data-note-editor>
      <div className={styles.editorTabs} role="group" aria-label="正文模式">
        {(
          [
            ["write", "写作"],
            ["preview", "阅读预览"],
            ["source", "Markdown 源文"],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            aria-pressed={mode === key}
            key={key}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => importInput.current?.click()}
        >
          导入 .md
        </button>
        <button type="button" disabled={!props.value} onClick={exportNote}>
          导出笔记
        </button>
      </div>
      {props.format === "plain_text" && (
        <div className={styles.legacy}>
          <p>这篇历史笔记使用纯文本。转换会保留原文字，再使用排版工具。</p>
          <button
            type="button"
            disabled={busy || !editor}
            onClick={() => {
              if (!editor) return;
              editor.commands.setContent(plainTextDocument(props.value), {
                emitUpdate: false,
              });
              props.onFormatChange("markdown_v1");
              props.onChange(editor.getMarkdown());
            }}
          >
            转换为富文本
          </button>
        </div>
      )}
      {mode === "preview" ? (
        <div className={styles.paper}>
          <MarkdownContent
            source={props.value}
            format={props.format}
            images={urls.current}
            resolveLink={(value) => {
              const match = /^(article|resort):([1-9]\d{0,9})$/.exec(value);
              if (!match || Number(match[2]) > 2147483647) return undefined;
              return getPageHref(
                match[1] === "article"
                  ? routes.articleDetail(Number(match[2]))
                  : routes.resortDetail(Number(match[2])),
              );
            }}
          />
        </div>
      ) : props.format === "plain_text" || mode === "source" || invalid ? (
        <label className={styles.sourceLabel}>
          {props.format === "plain_text" ? "纯文本正文" : "Markdown 源文"}
          <textarea
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            maxLength={10000}
            rows={18}
            disabled={busy}
          />
        </label>
      ) : (
        <>
          <div className={styles.toolbar} role="group" aria-label="笔记排版">
            {commands.map((x) => (
              <button
                type="button"
                key={x.label}
                disabled={busy || !editor}
                aria-pressed={!!x.active}
                onClick={x.action}
              >
                {x.label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy || !editor}
              onClick={() => {
                setLinkText(
                  editor?.state.doc.textBetween(
                    editor.state.selection.from,
                    editor.state.selection.to,
                  ) ?? "",
                );
                setLinkUrl(editor?.getAttributes("link").href ?? "");
                setLinkOpen(!linkOpen);
              }}
            >
              链接
            </button>
            <button
              type="button"
              disabled={busy || !editor || !props.canUpload}
              onClick={() => input.current?.click()}
            >
              {uploading ? "正在上传…" : "插入图片"}
            </button>
            <button
              type="button"
              disabled={busy || !editor}
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
              }
            >
              表格
            </button>
            {editor?.isActive("table") && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                >
                  增加行
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                >
                  增加列
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => editor.chain().focus().deleteTable().run()}
                >
                  移除表格
                </button>
              </>
            )}
            <button
              type="button"
              disabled={busy || !editor?.can().undo()}
              onClick={() => editor?.chain().focus().undo().run()}
            >
              撤销
            </button>
            <button
              type="button"
              disabled={busy || !editor?.can().redo()}
              onClick={() => editor?.chain().focus().redo().run()}
            >
              重做
            </button>
          </div>
          {linkOpen && (
            <fieldset className={styles.linkForm}>
              <legend>插入链接</legend>
              <label>
                显示文字
                <input
                  value={linkText}
                  maxLength={200}
                  onChange={(e) => setLinkText(e.target.value)}
                />
              </label>
              <label>
                链接地址
                <input
                  value={linkUrl}
                  maxLength={2000}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://… 或 article:123 / resort:123"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!allowedArticleLink(linkUrl.trim()) || !linkText.trim()) {
                    setIssue("请填写链接文字和安全地址。");
                    return;
                  }
                  editor
                    ?.chain()
                    .focus()
                    .insertContent({
                      type: "text",
                      text: linkText.trim(),
                      marks: [
                        { type: "link", attrs: { href: linkUrl.trim() } },
                      ],
                    })
                    .run();
                  setLinkOpen(false);
                  setIssue(null);
                }}
              >
                插入
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  editor?.chain().focus().unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                移除选中链接
              </button>
              <button type="button" onClick={() => setLinkOpen(false)}>
                取消
              </button>
            </fieldset>
          )}
          <EditorContent
            editor={editor}
            className={styles.paper}
            data-empty={editor?.isEmpty ?? true}
          />
        </>
      )}
      <footer className={styles.editorFoot}>
        <span>{props.value.length.toLocaleString()} / 10000 字符</span>
        <span>已添加 {props.images.length} 张图片</span>
      </footer>
      {issue || invalid ? (
        <p className={styles.error} role="alert">
          {issue || invalid}
        </p>
      ) : null}
      <input
        hidden
        type="file"
        ref={input}
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <input
        hidden
        type="file"
        ref={importInput}
        accept=".md,text/markdown"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file)
            void importFile(file).catch(() =>
              setIssue("文件无法读取，请重新选择。"),
            );
        }}
      />
    </section>
  );
}
