import { useCallback, useRef } from 'react'
import type { AnimatedIconHandle } from './animated-icon'

export function useAnimatedIconController() {
  const iconRef = useRef<AnimatedIconHandle>(null)
  const start = useCallback(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) iconRef.current?.startAnimation()
  }, [])
  const stop = useCallback(() => iconRef.current?.stopAnimation(), [])

  return {
    iconRef,
    animationProps: {
      onMouseEnter: start,
      onMouseLeave: stop,
      onFocus: start,
      onBlur: stop,
    },
  }
}
