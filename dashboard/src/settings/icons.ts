import {
  Accessibility, Bell, BookMarked, Bot, Cpu, FileText, FlaskConical, Folder, FolderKanban, House, Inbox, Keyboard, Layers, Lock,
  MessagesSquare, Mic, Palette, Plug, ScrollText, Search, Server, Settings2, Shield, SlidersHorizontal, Smartphone, Sun, Telescope,
  User, UserLock, Wallet, Wrench, Zap, type LucideIcon,
} from 'lucide-react'

/** The icon named in each topic file; an unknown name gets the plain settings icon. */
const ICONS: Record<string, LucideIcon> = {
  user: User, palette: Palette, house: House, sun: Sun, accessibility: Accessibility, keyboard: Keyboard, smartphone: Smartphone,
  inbox: Inbox, bell: Bell, 'messages-square': MessagesSquare, 'file-text': FileText, layers: Layers, telescope: Telescope,
  search: Search, mic: Mic, folder: Folder, cpu: Cpu, bot: Bot, 'book-marked': BookMarked, zap: Zap, wrench: Wrench,
  wallet: Wallet, shield: Shield, lock: Lock, 'user-lock': UserLock, plug: Plug, 'folder-kanban': FolderKanban, server: Server,
  'scroll-text': ScrollText, 'flask-conical': FlaskConical, 'sliders-horizontal': SlidersHorizontal,
}

export const groupIcon = (name: string): LucideIcon => ICONS[name] ?? Settings2
