import type { SVGProps } from "react";

const paths = {
  mountain: "m3 18 6-12 4 7 2-4 6 9H3Zm4-8 2 3 2-3",
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  content: "M5 3h10l4 4v14H5V3Zm9 0v5h5M8 12h8M8 16h6",
  business: "M4 8h16v13H4V8Zm4 0V4h8v4M4 13h16M10 13v3h4v-3",
  identity:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M19 8v6m-3-3h6M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6",
  ai: "M8 3v3m8-3v3M4 9H2m2 6H2m20-6h-2m2 6h-2M8 18v3m8-3v3M5 6h14v12H5V6Zm4 4h.01M15 10h.01M9 14h6",
  menu: "M4 6h16M4 12h16M4 18h16",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  logout: "M9 4H4v16h5m5-13 5 5-5 5m-7-5h12",
} as const;

export type AdminIconName = keyof typeof paths;

export function AdminIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: AdminIconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
