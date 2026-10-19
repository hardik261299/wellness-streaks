import type { ReactNode } from 'react';

/** Small stroke icons (24px grid). Decorative: names always come from adjacent text or aria-label. */
function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const IconCheck = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
export const IconChevronLeft = () => (
  <Svg>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);
export const IconChevronRight = () => (
  <Svg>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
export const IconFlame = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </Svg>
);
export const IconToday = () => (
  <Svg>
    <path d="M8 2v4M16 2v4" />
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M3 10h18" />
    <path d="m9 16 2 2 4-4" />
  </Svg>
);
export const IconTrophy = () => (
  <Svg>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-1.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98 1.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </Svg>
);
export const IconShield = () => (
  <Svg>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </Svg>
);
export const IconLogout = () => (
  <Svg>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Svg>
);
export const IconPlus = () => (
  <Svg>
    <path d="M5 12h14M12 5v14" />
  </Svg>
);
export const IconTrash = () => (
  <Svg>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);
export const IconArchive = () => (
  <Svg>
    <rect x="2" y="3" width="20" height="5" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
  </Svg>
);
export const IconUsers = () => (
  <Svg>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

/** Brand mark: a ring with a check, echoing the progress ring on the Today screen. */
export const LogoMark = ({ size = 28 }: { size?: number }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 32 32">
    <rect width="32" height="32" rx="9" fill="var(--accent)" />
    <circle cx="16" cy="16" r="8" fill="none" stroke="var(--accent-ink)" strokeOpacity=".35" strokeWidth="3" />
    <path
      d="M16 8a8 8 0 0 1 8 8"
      fill="none"
      stroke="var(--accent-ink)"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path d="m12.5 16.2 2.4 2.4 4.6-4.9" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
