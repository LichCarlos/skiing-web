export interface SseFrame {
  event: string;
  data: string;
}

// Line-oriented parsing handles CR/LF/CRLF and delimiters split across reads.
export function createSseParser(onFrame: (frame: SseFrame) => void) {
  let line = "";
  let event = "";
  let data: string[] = [];
  let size = 0;
  let skipLf = false;
  function endLine() {
    if (!line) {
      if (data.length)
        onFrame({ event: event || "message", data: data.join("\n") });
      event = "";
      data = [];
      size = 0;
    } else if (!line.startsWith(":")) {
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      if (field === "data") data.push(value);
    }
    line = "";
  }
  return {
    push(text: string) {
      for (const char of text) {
        if (skipLf && char === "\n") {
          skipLf = false;
          continue;
        }
        skipLf = false;
        if (++size > 1_000_000)
          throw new Error("AI stream event exceeded limit");
        if (char === "\r" || char === "\n") {
          endLine();
          skipLf = char === "\r";
        } else line += char;
      }
    },
  };
}
