import { getEntry } from '../game/content/catalog';
import { TEXTS } from '../game/content/texts';
import { LEVEL_COUNT } from '../game/play/gameReducer';
import CompanyChip from './CompanyChip';
import ModalFrame from './ModalFrame';

interface FichaModalProps {
  entryId: string;
  // Imagen del sprite pulsado (null si no se pudo sacar del canvas).
  imageUrl: string | null;
  variant: 'game' | 'levelComplete' | 'explore';
  // Nivel en el que está la jugadora (para "Pasar ao nivel N").
  level: number;
  onContinue: () => void;
  onNextLevel: () => void;
}

// Ficha de objeto: la misma en el juego, al completar un nivel y en exploración.
function FichaModal({ entryId, imageUrl, variant, level, onContinue, onNextLevel }: FichaModalProps) {
  const entry = getEntry(entryId);

  if (!entry) {
    return null;
  }

  const headline = variant === 'game'
    ? (entry.headline || TEXTS.ficha.defaultHeadline)
    : (variant === 'levelComplete' ? TEXTS.ficha.levelComplete : null);

  const button = variant === 'levelComplete' && level < LEVEL_COUNT
    ? { label: TEXTS.ficha.nextLevel(level + 1), onClick: onNextLevel }
    : { label: variant === 'explore' ? TEXTS.ficha.continueExplore : TEXTS.ficha.continueGame, onClick: onContinue };

  return (
    <ModalFrame labelledBy="ficha-title" wide={imageUrl !== null}>
      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {headline && <p className="text-lg font-extrabold text-amber-500">{headline}</p>}
          <h2 id="ficha-title" className="mt-1 text-3xl font-extrabold tracking-tight text-sky-600">{entry.name}</h2>
          <p className="mt-4 text-base leading-relaxed font-medium text-sky-900">{entry.text}</p>
          <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-sky-600">
            {TEXTS.ficha.madeBy}
            <CompanyChip company={entry.company} />
          </p>
        </div>
        {imageUrl && (
          // La imagen va en absoluto para que ocupe la altura del texto sin aumentarla.
          <div className="relative w-56 shrink-0">
            <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          autoFocus
          onClick={button.onClick}
          className="rounded-2xl bg-amber-400 px-6 py-3 text-lg font-extrabold text-white shadow-lg transition-transform hover:scale-105 hover:bg-amber-300"
        >
          {button.label}
        </button>
      </div>
    </ModalFrame>
  );
}

export default FichaModal;
