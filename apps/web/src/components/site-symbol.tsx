type Direction = "right" | "left" | "down" | "diagonal";
const angles: Record<Direction, number> = {
  right: 0,
  left: 180,
  down: 90,
  diagonal: -45,
};

export function ArrowIcon({ direction = "right" }: { direction?: Direction }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        transform={`rotate(${angles[direction]} 12 12)`}
      />
    </svg>
  );
}

export function CrossIcon({ close = false }: { close?: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 12h14M12 5v14"
        transform={close ? "rotate(45 12 12)" : undefined}
      />
    </svg>
  );
}
