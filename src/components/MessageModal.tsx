import type { ReactNode } from 'react';
import ModalFrame from './ModalFrame';

export interface MessageButton {
  label: string;
  onClick: () => void;
  secondary?: boolean;
}

interface MessageModalProps {
  title: string;
  children?: ReactNode;
  buttons: MessageButton[];
}

// Modal de texto con botones: incorrecto, derrota, final, confirmaciones e inactividad.
function MessageModal({ title, children, buttons }: MessageModalProps) {
  return (
    <ModalFrame labelledBy="message-title">
      <h2 id="message-title" className="text-3xl font-extrabold tracking-tight text-sky-600">{title}</h2>
      {children && <div className="mt-3 text-base leading-relaxed font-medium text-sky-900">{children}</div>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {buttons.map((button, index) => (
          <button
            key={button.label}
            type="button"
            autoFocus={index === 0}
            onClick={button.onClick}
            className={button.secondary
              ? 'rounded-2xl bg-sky-100 px-6 py-3 text-lg font-extrabold text-sky-700 transition-transform hover:scale-105 hover:bg-sky-200'
              : 'rounded-2xl bg-amber-400 px-6 py-3 text-lg font-extrabold text-white shadow-lg transition-transform hover:scale-105 hover:bg-amber-300'}
          >
            {button.label}
          </button>
        ))}
      </div>
    </ModalFrame>
  );
}

export default MessageModal;
