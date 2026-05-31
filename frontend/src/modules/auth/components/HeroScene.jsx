import { useEffect, useRef } from 'react'
import { useTranslation } from '../../../shared/i18n/index.js'

// Video hero + yağmur canvas + hareket HUD. Tüm tercih dışarıdan (useMotionPref) prop gelir.
export function HeroScene({ posterSrc, videoSrc, motion, setMotion, rain, setRain, reduced, children }) {
  const videoRef = useRef(null), canvasRef = useRef(null)
  const { t } = useTranslation()

  // video hız: calm→duraklat, slow→0.5x, normal→1x
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    if (motion === 'calm') { v.pause() } else { v.playbackRate = motion === 'slow' ? 0.5 : 1; v.play().catch(() => {}) }
  }, [motion])

  // yağmur partikülleri (kapatılabilir, calm'da kapalı, sekme gizliyken duraklar)
  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !rain || motion === 'calm') return
    const ctx = cv.getContext('2d'); if (!ctx) return  // jsdom/test ortamında canvas yok
    const size = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight }
    size(); window.addEventListener('resize', size)
    const drops = Array.from({ length: 90 }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, l: 8 + Math.random() * 12, s: 3 + Math.random() * 4 }))
    let raf
    const draw = () => {
      if (document.hidden) { raf = requestAnimationFrame(draw); return }
      ctx.clearRect(0, 0, cv.width, cv.height); ctx.strokeStyle = 'rgba(150,210,230,.25)'; ctx.lineWidth = 1
      drops.forEach(d => { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 1, d.y + d.l); ctx.stroke(); d.y += d.s * 2; d.x -= .4; if (d.y > cv.height) { d.y = -10; d.x = Math.random() * cv.width } })
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size) }
  }, [rain, motion])

  return (
    <header className="hero">
      <video className="hero-video" ref={videoRef} muted loop playsInline preload="auto" poster={posterSrc} aria-hidden="true">
        {videoSrc && <source src={videoSrc} type="video/mp4" />}
      </video>
      <div className="video-grade" />
      {!reduced && <canvas className="rain-canvas" ref={canvasRef} aria-hidden="true" />}
      <div className="hud">
        <div className="seg" role="group" aria-label="Hareket">
          {[['calm', 'Sakin'], ['slow', 'Yavaş'], ['normal', 'Normal']].map(([k, lb]) => (
            <button key={k} type="button" className={motion === k ? 'on' : ''} onClick={() => setMotion(k)}>{t(`login.hud.${k}`, lb)}</button>
          ))}
        </div>
        <button type="button" className={`toggle ${rain ? '' : 'off'}`} onClick={() => setRain(!rain)} aria-pressed={rain}>
          <span>{t('login.hud.rain', '🌧️ Yağmur')}</span><span className="sw" />
        </button>
      </div>
      {children}
    </header>
  )
}
