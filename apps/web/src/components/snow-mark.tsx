/** A geometric pixel snowflake; no icon font or external image request. */
export function SnowMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20 0h8v12h8V4h8v8h-8v8h12v8H36v8h8v8h-8v-8h-8v12h-8V36h-8v8H4v-8h8v-8H0v-8h12v-8H4V4h8v8h8z" />
    </svg>
  );
}
