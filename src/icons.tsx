// Inline SVG icons (stroke-based, 24px grid) — no icon font or CDN,
// so the app stays fully offline.

interface IconProps {
  size?: number;
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function IconReveal({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconFog({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17.5 17a4.5 4.5 0 1 0-1.03-8.88A6 6 0 1 0 6 16.7" />
      <path d="M4 20h12" />
      <path d="M7 23h7" />
    </svg>
  );
}

export function IconFogAll({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity="0.5" />
    </svg>
  );
}

export function IconClearFog({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m4 20 10.5-10.5a2.12 2.12 0 0 1 3 0l2 2a2.12 2.12 0 0 1 0 3L13 21" />
      <path d="M13 21H8l-4-4" />
      <path d="M19 5 5 19" opacity="0.4" />
    </svg>
  );
}

export function IconUndo({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  );
}

export function IconSave({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

export function IconFit({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function IconBack({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export function IconUpload({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

export function IconTrash({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconEdit({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

export function IconHexGrid({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 2.5 7.5 5.25v5.5L12 13.5l4.5-2.75v-5.5L12 2.5Z" />
      <path d="m7.5 10.75-4.5 2.75v5.5l4.5 2.75 4.5-2.75v-5.5" />
      <path d="m16.5 10.75 4.5 2.75v5.5L16.5 21.75 12 19v-5.5" />
    </svg>
  );
}

export function IconSquareGrid({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

export function IconGridOff({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="18" height="18" rx="1" opacity="0.45" />
      <path d="m5 19 14-14" />
    </svg>
  );
}

export function IconMap({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M14.1 6 8 3 2 6v15l6-3 6.1 3L20 18V9" />
      <path d="M8 3v15" />
      <path d="M14 6v5" />
      <circle cx="19" cy="5" r="2.5" />
    </svg>
  );
}
