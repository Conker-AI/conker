import {
  Suspense,
  type ComponentProps,
  type ForwardRefExoticComponent,
  type HTMLAttributes,
  type LazyExoticComponent,
  type Ref,
  type RefAttributes,
} from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAnimatedIconController } from './use-animated-icon-controller'

export type AnimatedIconHandle = {
  startAnimation: () => void
  stopAnimation: () => void
}

type SmoothIconProps = Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'> & {
  size?: number
  duration?: number
  isAnimated?: boolean
  color?: string
}

type AnimatedIconBase = ForwardRefExoticComponent<SmoothIconProps & RefAttributes<AnimatedIconHandle>>
export type AnimatedIconComponent = AnimatedIconBase | LazyExoticComponent<AnimatedIconBase>

export function AnimatedIconGlyph({
  icon: Icon,
  iconRef,
  size = 16,
  className,
}: {
  icon: AnimatedIconComponent
  iconRef?: Ref<AnimatedIconHandle>
  size?: number
  className?: string
}) {
  return (
    <span className="animated-icon-frame inline-flex shrink-0 items-center justify-center overflow-visible" style={{ width: size, height: size }} aria-hidden="true">
      <Suspense fallback={<span className="block size-full" />}>
        <Icon ref={iconRef} size={size} duration={0.9} className={cn('animated-lucide-icon size-full pointer-events-none', className)} aria-hidden="true" />
      </Suspense>
    </span>
  )
}

export function AnimatedIconButton({
  icon,
  iconSize,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  children,
  ...props
}: ComponentProps<typeof Button> & { icon: AnimatedIconComponent; iconSize?: number }) {
  const { iconRef, animationProps } = useAnimatedIconController()
  return (
    <Button
      {...props}
      onMouseEnter={event => { onMouseEnter?.(event); animationProps.onMouseEnter() }}
      onMouseLeave={event => { onMouseLeave?.(event); animationProps.onMouseLeave() }}
      onFocus={event => { onFocus?.(event); animationProps.onFocus() }}
      onBlur={event => { onBlur?.(event); animationProps.onBlur() }}
    >
      <AnimatedIconGlyph icon={icon} iconRef={iconRef} size={iconSize} />
      {children}
    </Button>
  )
}
