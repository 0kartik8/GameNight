import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Shared modal shell: dark backdrop, Escape and outside-click close, title row. */
export default function Overlay({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`pop max-h-[90dvh] w-full overflow-y-auto rounded-3xl bg-panel p-6 ${wide ? 'max-w-4xl' : 'max-w-xl'}`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
