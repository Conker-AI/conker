import { UserRound } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useOwnerProfile } from '@/lib/owner-profile'
import { cn } from '@/lib/utils'

export function OwnerAvatar({ className }: { className?: string }) {
  const profile = useOwnerProfile()
  return <Avatar className={cn('size-8', className)}>
    {profile.avatar && <AvatarImage src={profile.avatar} alt="" className="object-cover" />}
    <AvatarFallback aria-hidden="true"><UserRound className="size-[45%]" /></AvatarFallback>
  </Avatar>
}
