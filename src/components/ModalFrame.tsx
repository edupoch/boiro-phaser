import type { ReactNode } from 'react';

// Fondo y caja comunes a todos los modales. El fondo tapa el canvas, así que el mapa no recibe toques.
function ModalFrame({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-sky-950/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="w-full max-w-md rounded-3xl border-4 border-white bg-white p-8 font-sans shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

export default ModalFrame;
