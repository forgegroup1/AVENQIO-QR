export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="#140f1f" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="11.5" stroke="#C4B5FD" strokeOpacity="0.45" />
      <path
        fill="url(#avenqio-mark)"
        fillRule="evenodd"
        d="M20 8.5 31.2 31.5h-4.7l-1.7-4.2H15.2l-1.7 4.2H8.8L20 8.5Zm0 8.3-2.9 7.1h5.8L20 16.8Z"
      />
      <defs>
        <linearGradient id="avenqio-mark" x1="9" y1="9" x2="31" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EDE9FE" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
