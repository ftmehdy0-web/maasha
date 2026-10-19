export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      {/* An "M" made of two play triangles */}
      <path d="M8 23V9l8 7z" fill="#fff" />
      <path d="M16 16l8-7v14z" fill="#fff" fillOpacity=".75" />
    </svg>
  );
}
