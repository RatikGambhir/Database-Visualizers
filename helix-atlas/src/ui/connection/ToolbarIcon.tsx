export function ToolbarIcon({
  name,
  connected = false,
}: {
  name:
    | "connection"
    | "query"
    | "schema"
    | "graph"
    | "sun"
    | "moon"
    | "desktop"
    | "cloud";
  connected?: boolean;
}) {
  const common = {
    width: 27,
    height: 27,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "connection")
    return (
      <svg {...common}>
        <path d="M8 7V4m8 3V4M6 7h12v4a6 6 0 0 1-12 0V7Z" />
        <path d="M12 17v3" />
        {connected ? (
          <circle cx="12" cy="11" r="2" fill="currentColor" stroke="none" />
        ) : null}
      </svg>
    );
  if (name === "query")
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8 9 2.5 2.5L8 14m5 0h3" />
      </svg>
    );
  if (name === "schema")
    return (
      <svg {...common}>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4v5m0 6v5M4 12h5m6 0h5" />
      </svg>
    );
  if (name === "graph")
    return (
      <svg {...common}>
        <circle cx="6" cy="12" r="2.4" />
        <circle cx="17" cy="6" r="2.4" />
        <circle cx="18" cy="17" r="2.4" />
        <path d="m8.1 10.9 6.7-3.7m-6.4 6 7.3 2.8m1.4-7.6.6 6.2" />
      </svg>
    );
  if (name === "sun")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (name === "moon")
    return (
      <svg {...common}>
        <path d="M20 15.2A8.3 8.3 0 0 1 8.8 4a8.4 8.4 0 1 0 11.2 11.2Z" />
      </svg>
    );
  if (name === "desktop")
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M7 18h11a4 4 0 0 0 .7-7.9A7 7 0 0 0 5.3 8.7 4.7 4.7 0 0 0 7 18Z" />
    </svg>
  );
}
