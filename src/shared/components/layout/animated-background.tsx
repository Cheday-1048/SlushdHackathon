import { useReducedMotion } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import { useBackgroundSettings } from './background-context'

/**
 * Full-viewport decorative background. Colors come from the --bg-* tokens.
 * - gradient: soft drifting radial gradients (CSS transforms only)
 * - static:   token-driven image fallback (public/assets/backgrounds/*)
 * - video:    WebM/MP4 with poster; falls back to static on error or reduced motion
 * Grain and glow are overlays on top of every variant.
 */
export function AnimatedBackground() {
  const { settings } = useBackgroundSettings()
  const reducedMotion = useReducedMotion()
  const [videoFailed, setVideoFailed] = useState(false)

  const useVideo = settings.variant === 'video' && !!settings.videoSrc && !reducedMotion && !videoFailed
  const useStatic = settings.variant === 'static' || (settings.variant === 'video' && !useVideo)

  const style = {
    '--grain-opacity': settings.grain,
    '--glow-opacity': settings.glow,
  } as CSSProperties

  return (
    <div className="bg-layer" aria-hidden data-motion={settings.animated ? 'on' : 'off'} style={style}>
      {useVideo && (
        <video
          className="bg-video"
          src={settings.videoSrc}
          poster={settings.posterSrc}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setVideoFailed(true)}
        />
      )}
      {useStatic && (
        <div
          className="bg-static"
          style={settings.posterSrc ? { backgroundImage: `url(${settings.posterSrc})` } : undefined}
        />
      )}
      {settings.variant === 'gradient' && (
        <>
          <div className="bg-blob bg-blob-1" />
          <div className="bg-blob bg-blob-2" />
          <div className="bg-blob bg-blob-3" />
        </>
      )}
      <div className="bg-glow" />
      <div className="bg-grain" />
    </div>
  )
}
