import { useEffect, useState } from 'react'

export type OwnerProfile = { name: string; avatar: string }

const STORAGE_KEY = 'conker-owner-profile-v1'
const CHANGE_EVENT = 'conker-owner-profile-change'
const fallback: OwnerProfile = { name: 'You', avatar: '' }

function readOwnerProfile(): OwnerProfile {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<OwnerProfile> | null
    return { name: typeof value?.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 60) : fallback.name, avatar: typeof value?.avatar === 'string' ? value.avatar : '' }
  } catch { return fallback }
}

export function saveOwnerProfile(profile: OwnerProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: profile.name.trim().slice(0, 60) || fallback.name, avatar: profile.avatar }))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useOwnerProfile() {
  const [profile, setProfile] = useState(readOwnerProfile)
  useEffect(() => {
    const update = () => setProfile(readOwnerProfile())
    window.addEventListener(CHANGE_EVENT, update)
    window.addEventListener('storage', update)
    return () => { window.removeEventListener(CHANGE_EVENT, update); window.removeEventListener('storage', update) }
  }, [])
  return profile
}
