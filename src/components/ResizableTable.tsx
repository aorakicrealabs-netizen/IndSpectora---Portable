import React, { useCallback, useState } from 'react';

export function useResizableColumns<T extends string>(
  initialWidths: Record<T, number>,
  minWidth = 64
) {
  const [widths, setWidths] = useState<Record<T, number>>(initialWidths);

  const startResize = useCallback(
    (key: T, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = widths[key] ?? 120;

      function onMove(ev: PointerEvent) {
        const nextWidth = Math.max(minWidth, Math.round(startWidth + (ev.clientX - startX)));
        setWidths((prev) => ({ ...prev, [key]: nextWidth }));
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [widths, minWidth]
  );

  return { widths, setWidths, startResize };
}

interface ResizableThProps {
  width: number;
  onStartResize: (e: React.PointerEvent) => void;
  align?: 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}

export function ResizableTh({
  width,
  onStartResize,
  align = 'left',
  className = '',
  children,
}: ResizableThProps) {
  return (
    <th
      style={{ width, minWidth: width, maxWidth: width }}
      className={`relative select-none ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      <div className={`truncate ${align === 'right' ? 'pr-2' : 'pr-2'}`}>{children}</div>
      <div
        onPointerDown={onStartResize}
        title="Drag to resize column"
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#1D4ED8]/30 dark:hover:bg-[#60A5FA]/35 active:bg-[#1D4ED8]/50 transition-colors z-10"
      />
    </th>
  );
}
