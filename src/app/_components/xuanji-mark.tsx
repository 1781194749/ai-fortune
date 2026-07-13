export function XuanjiMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#c9a35f]/45 bg-[#c9a35f]/8 text-[#efd9a6] ${className}`}
      aria-hidden="true"
    >
      <span className="absolute inset-[5px] rounded-full border border-[#c9a35f]/20" />
      <svg viewBox="0 0 40 40" className="relative size-6" fill="none">
        <circle cx="20" cy="20" r="3.5" fill="currentColor" />
        <path d="M20 5v8M20 27v8M5 20h8M27 20h8" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="m9.4 9.4 5.7 5.7M24.9 24.9l5.7 5.7M30.6 9.4l-5.7 5.7M15.1 24.9l-5.7 5.7"
          stroke="currentColor"
          strokeWidth="0.8"
          opacity="0.7"
        />
        <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="0.7" opacity="0.45" />
      </svg>
    </span>
  );
}
