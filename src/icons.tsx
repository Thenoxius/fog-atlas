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

export function IconText({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 7V5h16v2" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </svg>
  );
}

export function IconBrushRound({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export function IconBrushRect({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </svg>
  );
}

export function IconInitiative({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconFlipVertical({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3v4" />
      <path d="m9 5 3-3 3 3" />
      <path d="M12 17v4" />
      <path d="m9 19 3 3 3-3" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function IconUsers({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconPortrait({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 19c1-3 3.5-4 6-4s5 1 6 4" />
    </svg>
  );
}

export function IconChevron({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconRuler({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4Z" />
      <path d="m7.5 10.5 2-2" />
      <path d="m10.5 13.5 2-2" />
      <path d="m13.5 16.5 2-2" />
    </svg>
  );
}

export function IconShield({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" />
    </svg>
  );
}

export function IconSkull({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 20v1a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20Z" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <path d="m12.5 17-.5-1-.5 1h1z" />
    </svg>
  );
}

export function IconChevronsRight({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m6 17 5-5-5-5" />
      <path d="m13 17 5-5-5-5" />
    </svg>
  );
}

export function IconChevronsLeft({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </svg>
  );
}

export function IconNote({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 3h10a2 2 0 0 1 2 2v10l-6 6H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 21v-4a2 2 0 0 1 2-2h4" />
      <path d="M9 8h6" />
      <path d="M9 12h4" />
    </svg>
  );
}

export function IconToken({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function IconLayers({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  );
}

export function IconPresent({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

export function IconAward({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="8" r="6" />
      <path d="m9 13.5-1.5 7.5 4.5-2.5 4.5 2.5-1.5-7.5" />
    </svg>
  );
}

export function IconCoffee({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
      <path d="M6 2v2" />
      <path d="M10 2v2" />
      <path d="M14 2v2" />
    </svg>
  );
}

export function IconCollection({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </svg>
  );
}

export function IconClose({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function IconFullscreen({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M15 3h6v6" />
      <path d="m21 3-7 7" />
      <path d="M9 21H3v-6" />
      <path d="m3 21 7-7" />
    </svg>
  );
}

export function IconExitFullscreen({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20 10h-6V4" />
      <path d="m14 10 7-7" />
      <path d="M4 14h6v6" />
      <path d="m10 14-7 7" />
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
