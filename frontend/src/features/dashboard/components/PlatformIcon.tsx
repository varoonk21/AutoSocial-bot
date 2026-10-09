import { PLATFORM_COLORS } from '@/constants/platforms'

type Platform = keyof typeof PLATFORM_COLORS

interface PlatformIconProps {
  platform: Platform
  size?: number
}

export function PlatformIcon({ platform, size = 16 }: PlatformIconProps) {
  const color = PLATFORM_COLORS[platform] || '#6b7280'

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      {platform === 'linkedin' && (
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" />
      )}
      {platform === 'x' && (
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      )}
      {platform === 'instagram' && (
        <>
          <rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke={color} strokeWidth="2" />
          <circle cx="12" cy="12" r="5" fill="none" stroke={color} strokeWidth="2" />
          <circle cx="17.5" cy="6.5" r="1.5" fill={color} />
        </>
      )}
      {platform === 'facebook' && (
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      )}
    </svg>
  )
}
