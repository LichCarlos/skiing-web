"use client";
import { AdminParagraph } from "@/components/admin-paragraph";
import { FormHint } from "@/components/form-hint";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Button, Input, Modal, Space } from "antd";
import { inspectMarkdown, MarkdownContent } from "@common/ui";
import { articleEditorExtensions } from "@/features/articles/article-editor-schema";
import {
  allowedArticleLink,
  articleAssetReference,
  plainTextDocument,
} from "@/features/articles/article-content-links";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { getPublicContentHref } from "@/platform/config";
import {
  AssetPickerRun,
  pickerIdentity,
} from "@/features/assets/asset-picker-run";
import {
  uploadImage,
  assetFailure,
} from "@/features/assets/asset-library-model";
import styles from "@/features/articles/article-body-editor.module.css";

type Props = {
  value?: string;
  onChange?: (value: string) => void;
  format?: string;
  onFormatChange: (format: "plain_text" | "markdown_v1") => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  images?: { assetId: string; url: string }[];
  id?: string;
};
export function ArticleBodyEditor(props: Props) {
  const { session } = useSession();
  return session.status === "authenticated" ? (
    <EditorWorkspace
      key={pickerIdentity(session.currentUser)}
      {...props}
      user={session.currentUser}
    />
  ) : (
    <AdminParagraph>请确认登录后编辑正文</AdminParagraph>
  );
}
function EditorWorkspace({
  value = "",
  format = "plain_text",
  onChange,
  onFormatChange,
  disabled,
  onBusyChange,
  images = [],
  id,
  user,
}: Props & {
  user: NonNullable<ReturnType<typeof useSession>["session"]["currentUser"]>;
}) {
  const [mode, setMode] = useState<"write" | "preview" | "source">("write");
  const [issue, setIssue] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null);
  const imageUrls = useRef<Record<string, string>>({});
  for (const image of images)
    imageUrls.current[`asset:${image.assetId}`] = image.url;
  const latest = useRef({ onChange, onFormatChange, onBusyChange, disabled });
  latest.current = { onChange, onFormatChange, onBusyChange, disabled };
  const [uploadRun] = useState(() => new AssetPickerRun(user, apiRequest));
  const extensions = useState(() =>
    articleEditorExtensions((url) => imageUrls.current[url]),
  )[0];
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content:
      format === "markdown_v1"
        ? inspectMarkdown(value, {
            image: articleAssetReference,
            link: allowedArticleLink,
          })
          ? ""
          : value
        : plainTextDocument(value),
    contentType: format === "markdown_v1" ? "markdown" : "json",
    editable: !disabled,
    editorProps: {
      attributes: {
        "aria-label": "文章富文本正文",
        role: "textbox",
        "aria-multiline": "true",
      },
      handlePaste(view, event) {
        // Never import arbitrary clipboard HTML/images or execute a remote fetch.
        if (event.clipboardData?.files.length) {
          setIssue("请使用上传图片按钮插图，粘贴文件不会自动上传");
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
          setIssue("请使用上传图片按钮，文件不会自动上传");
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      latest.current.onChange?.(editor.getMarkdown());
      setRevision((n) => n + 1);
    },
    onSelectionUpdate() {
      setRevision((n) => n + 1);
    },
  });
  useEffect(() => {
    uploadRun.activate();
    return () => {
      uploadRun.dispose();
      latest.current.onBusyChange?.(false);
      imageUrls.current = {};
    };
  }, [uploadRun]);
  useEffect(() => {
    editor?.setEditable(
      !disabled &&
        !uploading &&
        format === "markdown_v1" &&
        !inspectMarkdown(value, {
          image: articleAssetReference,
          link: allowedArticleLink,
        }),
      false,
    );
  }, [editor, disabled, uploading, format, value]);
  useEffect(() => {
    if (!editor) return;
    if (
      format === "markdown_v1" &&
      !inspectMarkdown(value, {
        image: articleAssetReference,
        link: allowedArticleLink,
      }) &&
      editor.getMarkdown() !== value
    )
      editor.commands.setContent(value, {
        contentType: "markdown",
        emitUpdate: false,
      });
  }, [editor, value, format]);
  const busy = disabled || uploading;
  const check = (source: string) =>
    inspectMarkdown(source, {
      image: articleAssetReference,
      link: allowedArticleLink,
    });
  async function upload(file: File) {
    if (busy || !editor || !user.permissionKeys.includes("asset:upload"))
      return;
    setUploading(true);
    latest.current.onBusyChange?.(true);
    setIssue(undefined);
    const bookmark = editor.state.selection.from;
    await uploadRun.execute(
      "asset:upload",
      (signal) => uploadImage(apiRequest, file, signal),
      {
        done(asset) {
          if (!asset.url || !editor || editor.isDestroyed) return;
          imageUrls.current[`asset:${asset.assetId}`] = asset.url;
          editor
            .chain()
            .focus()
            .setTextSelection(Math.min(bookmark, editor.state.doc.content.size))
            .setImage({
              src: `asset:${asset.assetId}`,
              alt: asset.originalName.replace(/[\]\\[]/g, ""),
            })
            .run();
        },
        error(cause) {
          setIssue(
            `${assetFailure(cause)}。上传结果不明时请先核对媒体库，不会自动重试。`,
          );
        },
        settled() {
          setUploading(false);
          latest.current.onBusyChange?.(false);
        },
      },
    );
  }
  async function importFile(file: File) {
    if (busy || !editor) return;
    if (!/\.md$/i.test(file.name) || file.size > 400000) {
      setIssue("请选择不超过 400 KB 的 .md 文件，正文仍限制 100000 字符");
      return;
    }
    const source = (await file.text())
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n");
    if (latest.current.disabled || editor.isDestroyed) return;
    const error = check(source);
    if (error) {
      setIssue(error);
      return;
    }
    Modal.confirm({
      title: "用导入文件替换当前正文？",
      content:
        "仅导入支持的 Markdown 子集；图片必须已上传，未知 Asset ID 会在保存时被拒绝。",
      onOk() {
        if (latest.current.disabled || editor.isDestroyed) return;
        latest.current.onFormatChange("markdown_v1");
        editor.commands.setContent(source, { contentType: "markdown" });
        latest.current.onChange?.(source);
        setIssue(undefined);
      },
    });
  }
  const invalid = format === "markdown_v1" ? check(value) : null;
  const commands = [
    {
      label: "正文",
      action: () => editor?.chain().focus().setParagraph().run(),
      active: editor?.isActive("paragraph"),
    },
    ...([1, 2, 3] as const).map((level) => ({
      label: `标题 ${level}`,
      action: () => editor?.chain().focus().toggleHeading({ level }).run(),
      active: editor?.isActive("heading", { level }),
    })),
    {
      label: "粗体",
      action: () => editor?.chain().focus().toggleBold().run(),
      active: editor?.isActive("bold"),
    },
    {
      label: "斜体",
      action: () => editor?.chain().focus().toggleItalic().run(),
      active: editor?.isActive("italic"),
    },
    {
      label: "无序列表",
      action: () => editor?.chain().focus().toggleBulletList().run(),
      active: editor?.isActive("bulletList"),
    },
    {
      label: "有序列表",
      action: () => editor?.chain().focus().toggleOrderedList().run(),
      active: editor?.isActive("orderedList"),
    },
    {
      label: "引用",
      action: () => editor?.chain().focus().toggleBlockquote().run(),
      active: editor?.isActive("blockquote"),
    },
    {
      label: "代码块",
      action: () => editor?.chain().focus().toggleCodeBlock().run(),
      active: editor?.isActive("codeBlock"),
    },
  ];
  return (
    <section className={styles.root} id={id} data-revision={revision}>
      <header className={styles.header}>
        <strong>写一篇值得收藏的滑雪笔记</strong>
        <span>{format === "markdown_v1" ? "Markdown · v1" : "旧版纯文本"}</span>
      </header>
      <div className={styles.tabs} role="group" aria-label="正文模式">
        {(
          [
            ["write", "写作"],
            ["preview", "阅读预览"],
            ["source", "源文"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
          >
            {label}
          </Button>
        ))}
        <Button disabled={busy} onClick={() => importInput.current?.click()}>
          导入 .md
        </Button>
        <Button
          disabled={!value || busy}
          onClick={() => {
            const blob = new Blob([value], {
              type: "text/markdown;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download =
              format === "markdown_v1" ? "滑雪笔记.md" : "滑雪笔记.txt";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          导出{format === "markdown_v1" ? " .md" : " .txt"}
        </Button>
      </div>
      {format !== "markdown_v1" ? (
        <div className={styles.legacy}>
          <AdminParagraph>
            历史正文按纯文本显示。转换会保留文字，不把原来的 #、* 或 HTML
            当作语法。
          </AdminParagraph>
          <Button disabled={busy} onClick={() => setConvertOpen(true)}>
            转换为富文本笔记
          </Button>
        </div>
      ) : null}
      {mode === "preview" ? (
        <div className={styles.paper}>
          <MarkdownContent
            source={value}
            format={format}
            images={imageUrls.current}
            resolveLink={getPublicContentHref}
          />
        </div>
      ) : format !== "markdown_v1" ? (
        <Input.TextArea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          rows={18}
          disabled={busy}
          aria-label="文章纯文本正文"
          maxLength={100000}
        />
      ) : mode === "source" || invalid ? (
        <Input.TextArea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          rows={18}
          disabled={busy}
          aria-label="Markdown 源文"
          maxLength={100000}
        />
      ) : (
        <>
          <div className={styles.toolbar} role="group" aria-label="正文排版">
            {commands.map((command) => (
              <button
                type="button"
                key={command.label}
                disabled={busy || !editor}
                aria-pressed={!!command.active}
                onClick={command.action}
              >
                {command.label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy || !editor}
              onClick={() => {
                setLinkUrl(editor?.getAttributes("link").href ?? "");
                setLinkLabel(
                  editor?.state.doc.textBetween(
                    editor.state.selection.from,
                    editor.state.selection.to,
                  ) ?? "",
                );
                setLinkOpen(true);
              }}
            >
              插入链接
            </button>
            <button
              type="button"
              disabled={
                busy || !editor || !user.permissionKeys.includes("asset:upload")
              }
              onClick={() => input.current?.click()}
            >
              {uploading ? "正在上传…" : "上传图片"}
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
              插入表格
            </button>
            {editor?.isActive("table") ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                >
                  新增行
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                >
                  新增列
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => editor.chain().focus().deleteTable().run()}
                >
                  删除表格
                </button>
              </>
            ) : null}
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
          <EditorContent editor={editor} className={styles.paper} />
        </>
      )}
      <footer className={styles.footer}>
        <span>{value.length.toLocaleString()} / 100000 字符</span>
        <span>保存后才可发布 · 正文图片随文章发布公开</span>
      </footer>
      {issue || invalid ? (
        <AdminParagraph role="alert" className={styles.error}>
          {issue || invalid}
        </AdminParagraph>
      ) : null}
      <AdminParagraph className={styles.hint}>
        链接支持
        https://…、article:文章ID、resort:雪场ID。只引用已公开内容；失效目标由详情页提示不可用。图片不包含在导出的文件中，导出文件仍依赖本站
        Asset。
      </AdminParagraph>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept=".md,text/markdown"
        hidden
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            void importFile(f).catch(() =>
              setIssue("文件无法读取，请重新选择"),
            );
        }}
      />
      <Modal
        title="插入文档或雪场链接"
        open={linkOpen}
        onCancel={() => setLinkOpen(false)}
        okButtonProps={{ disabled: busy }}
        onOk={() => {
          if (!allowedArticleLink(linkUrl.trim()) || !linkLabel.trim()) {
            setIssue("请填写链接文字与安全地址");
            return;
          }
          editor
            ?.chain()
            .focus()
            .insertContent({
              type: "text",
              text: linkLabel.trim(),
              marks: [{ type: "link", attrs: { href: linkUrl.trim() } }],
            })
            .run();
          setLinkOpen(false);
          setIssue(undefined);
        }}
      >
        <Space orientation="vertical" style={{ width: "100%" }}>
          <label>
            显示文字
            <Input
              value={linkLabel}
              aria-label="显示文字"
              aria-describedby="article-link-label-hint"
              maxLength={200}
              onChange={(e) => setLinkLabel(e.target.value)}
            />
            <FormHint id="article-link-label-hint">
              填写链接展示文字，最多200字。
            </FormHint>
          </label>
          <label>
            链接地址
            <Input
              value={linkUrl}
              aria-label="链接地址"
              aria-describedby="article-link-url-hint"
              maxLength={2000}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://… 或 article:123 / resort:123"
            />
            <FormHint id="article-link-url-hint">
              填写完整 http(s) 地址，或 article:123 / resort:123
              站内引用，最多2000字。
            </FormHint>
          </label>
          <Button
            disabled={busy}
            onClick={() => {
              editor?.chain().focus().unsetLink().run();
              setLinkOpen(false);
            }}
          >
            移除选中链接
          </Button>
        </Space>
      </Modal>
      <Modal
        title="将旧正文转换为富文本？"
        open={convertOpen}
        onCancel={() => setConvertOpen(false)}
        onOk={() => {
          if (busy || !editor) return;
          editor.commands.setContent(plainTextDocument(value), {
            emitUpdate: false,
          });
          onFormatChange("markdown_v1");
          onChange?.(editor.getMarkdown());
          setConvertOpen(false);
        }}
      >
        <AdminParagraph>
          这是显式格式转换，不会直接重新解释原文中的 Markdown
          符号。转换后请预览并保存，尚未提交到服务器。
        </AdminParagraph>
      </Modal>
    </section>
  );
}
