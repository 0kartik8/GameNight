import type { ReactNode } from 'react'
import { X } from 'lucide-react'
export const Button = ({ children, onClick, variant = 'primary', className = '', disabled }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost'; className?: string; disabled?: boolean }) => (
  <button disabled={disabled} onClick={onClick} className={`rounded-2xl px-5 py-3 font-display font-bold transition active:translate-y-1 active:shadow-none disabled:opacity-40 ${variant === 'primary' ? 'bg-lime text-ink shadow-[0_5px_0_#6a8f12] hover:-translate-y-0.5' : 'bg-white/10 hover:bg-white/20'} ${className}`}>{children}</button>)
export const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} className={`rounded-full border px-4 py-2 text-sm font-bold transition ${on ? 'border-pink bg-pink text-white' : 'border-white/20 text-white/70 hover:border-white/50'}`}>{children}</button>)
export const Shell = ({ children }: { children: ReactNode }) => (
  <div className="relative mx-auto min-h-dvh max-w-3xl overflow-hidden px-5 py-6">
    <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-violet/30 blur-3xl"/><div className="pointer-events-none absolute -right-24 top-1/3 size-72 rounded-full bg-pink/20 blur-3xl"/>
    <div className="relative">{children}</div></div>)
export const Dialog = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) => open ? (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
    <div onClick={e => e.stopPropagation()} className="pop w-full max-w-md rounded-t-3xl bg-panel p-6 sm:rounded-3xl">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-extrabold">{title}</h2><button onClick={onClose} aria-label="Close"><X/></button></div>{children}</div></div>) : null
