'use client'

import Image from 'next/image'

const LOGO_PURPLE_SRC = '/brand/logo-purple.png'
const LOGO_WHITE_SRC = '/brand/logo-white.png'
const LOGO_WIDTH = 194
const LOGO_HEIGHT = 58

function LogoImage({
  dark = false,
  height,
  alt,
}: {
  dark?: boolean
  height: number
  alt: string
}) {
  return (
    <Image
      src={dark ? LOGO_WHITE_SRC : LOGO_PURPLE_SRC}
      alt={alt}
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority
      style={{
        height,
        width: 'auto',
        display: 'block',
        objectFit: 'contain',
      }}
    />
  )
}

export function KLogo({ dark = false, size = 32 }: { dark?: boolean; size?: number }) {
  return <LogoImage dark={dark} height={size} alt="" />
}

export function WordMark({ dark = false }: { dark?: boolean }) {
  return <LogoImage dark={dark} height={28} alt="Connekt" />
}
