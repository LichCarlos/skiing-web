import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

interface Node {
  type: string;
  url?: string;
  identifier?: string;
  checked?: boolean | null;
  children?: Node[];
}
const parser = unified().use(remarkParse).use(remarkGfm);
const supported = new Set([
  "root",
  "paragraph",
  "heading",
  "text",
  "strong",
  "emphasis",
  "delete",
  "list",
  "listItem",
  "blockquote",
  "thematicBreak",
  "break",
  "code",
  "inlineCode",
  "link",
  "image",
  "definition",
  "linkReference",
  "imageReference",
  "table",
  "tableRow",
  "tableCell",
]);
/** Validate before an editor conversion can silently discard unsupported syntax. */
export function inspectMarkdown(
  source: string,
  policy: { image: (url: string) => boolean; link: (url: string) => boolean },
): string | null {
  if (source.length > 100000) return "正文不能超过 100000 字符";
  const root = parser.parse(source) as Node;
  const stack: Array<[Node, number]> = [[root, 0]],
    nodes: Node[] = [];
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (depth > 32 || nodes.length >= 10000)
      return "正文结构过于复杂，请分篇编辑";
    if (!supported.has(node.type) || node.checked != null)
      return "暂不支持 HTML、嵌入内容、脚注或任务列表，请改为普通 Markdown";
    nodes.push(node);
    for (const child of node.children ?? []) stack.push([child, depth + 1]);
  }
  const definitions = new Map(
    nodes
      .filter((n) => n.type === "definition")
      .map((n) => [n.identifier, n.url]),
  );
  let linkCount = 0;
  for (const node of nodes) {
    const url = node.url ?? definitions.get(node.identifier) ?? "";
    if (["link", "linkReference"].includes(node.type) && ++linkCount > 100)
      return "链接最多100次引用";
    if (["image", "imageReference"].includes(node.type) && !policy.image(url))
      return "图片需先上传后插入；不支持远程图片、本地路径或 data URL";
    if (["link", "linkReference"].includes(node.type) && !policy.link(url))
      return "存在不支持或不安全的链接，请使用 HTTP(S) 或站内内容引用";
  }
  return null;
}
