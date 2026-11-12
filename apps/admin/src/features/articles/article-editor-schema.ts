import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { safeContentUrl } from "@common/ui";
import {
  allowedArticleLink,
  articleAssetReference,
} from "@/features/articles/article-content-links";

/** Keep literal paragraph text from turning into a heading/list on the next read. */
const SafeStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) =>
      extension.name !== "paragraph"
        ? extension
        : extension.extend({
            renderMarkdown(node, helpers, context) {
              const content = node.content ?? [];
              if (!content.length)
                return context?.previousNode?.type === "paragraph" &&
                  !context.previousNode.content?.length
                  ? "&nbsp;"
                  : "";
              return helpers
                .renderChildren(content)
                .replace(/(^|\n)([ \t]*)([#>+=-])/g, "$1$2\\$3")
                .replace(/(^|\n)([ \t]*)(\d+)([.)])(?=\s)/g, "$1$2$3\\$4")
                .replace(
                  /(^|\n)([ \t]{4,}|\t+)/g,
                  (_match, start: string, spaces: string) =>
                    start +
                    spaces.replace(/ /g, "&#32;").replace(/\t/g, "&#9;"),
                );
            },
          }),
    );
  },
});

export function articleEditorExtensions(
  resolveImage: (reference: string) => string | undefined = () => undefined,
) {
  const AssetImage = Image.extend({
    parseHTML() {
      return [{ tag: 'img[src^="asset:"]' }];
    },
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement("figure");
        dom.contentEditable = "false";
        const draw = (src: string, alt: string) => {
          dom.replaceChildren();
          const url = articleAssetReference(src)
            ? resolveImage(src)
            : undefined;
          if (url && safeContentUrl(url)) {
            const image = document.createElement("img");
            image.src = url;
            image.alt = alt || "正文图片";
            dom.append(image);
          } else {
            dom.textContent = "图片预览不可用，请刷新资料；不会加载外部图片";
          }
        };
        draw(String(node.attrs.src ?? ""), String(node.attrs.alt ?? ""));
        return {
          dom,
          update(next) {
            if (next.type !== node.type) return false;
            draw(String(next.attrs.src ?? ""), String(next.attrs.alt ?? ""));
            return true;
          },
        };
      };
    },
  });
  return [
    SafeStarterKit.configure({
      underline: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        openOnClick: false,
        autolink: true,
        protocols: ["article", "resort"],
        isAllowedUri: allowedArticleLink,
      },
    }),
    AssetImage.configure({ allowBase64: false }),
    TableKit.configure({ table: { resizable: false } }),
    Markdown,
  ];
}
