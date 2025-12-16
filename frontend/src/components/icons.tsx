import type { SVGProps } from 'react'

// Minimal hand-rolled line icons (1.75px stroke, 16px grid) so we don't pull
// in an icon library dependency for a handful of glyphs.
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconOverview(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </Icon>
  )
}

export function IconLogout(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6.5 14H3.2A1.2 1.2 0 0 1 2 12.8V3.2A1.2 1.2 0 0 1 3.2 2H6.5" />
      <path d="M10.8 11.2 14 8l-3.2-3.2M14 8H6" />
    </Icon>
  )
}

export function IconArrowLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M13 8H3M6.5 4.5 3 8l3.5 3.5" />
    </Icon>
  )
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8 3v10M3 8h10" />
    </Icon>
  )
}

export function IconPulse(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M1.5 8h3l1.5-4.5L9 12.5 10.5 8h4" />
    </Icon>
  )
}
