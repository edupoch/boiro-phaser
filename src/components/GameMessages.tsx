import { getEntry } from '../game/content/catalog';
import { TEXTS } from '../game/content/texts';
import { companySummary, type GameState, type Modal } from '../game/play/gameReducer';
import CompanyChip from './CompanyChip';
import MessageModal from './MessageModal';

interface GameMessagesProps {
  state: GameState;
  modal: Extract<Modal, { kind: 'wrong' | 'lost' | 'won' }>;
  onContinue: () => void;
  onPlayAgain: () => void;
  onExplore: () => void;
}

// Modales de resultado del modo xogo: objeto incorrecto, derrota y final.
function GameMessages({ state, modal, onContinue, onPlayAgain, onExplore }: GameMessagesProps) {
  const endButtons = [
    { label: TEXTS.endButtons.playAgain, onClick: onPlayAgain },
    { label: TEXTS.endButtons.explore, onClick: onExplore, secondary: true },
  ];

  if (modal.kind === 'wrong') {
    return (
      <MessageModal title={TEXTS.wrong.title} buttons={[{ label: TEXTS.wrong.continue, onClick: onContinue }]}>
        <p>{TEXTS.wrong.attemptsLeft(modal.attemptsLeft)}</p>
      </MessageModal>
    );
  }

  if (modal.kind === 'lost') {
    return (
      <MessageModal title={TEXTS.lost.title} buttons={endButtons}>
        <p>{TEXTS.lost.body}</p>
      </MessageModal>
    );
  }

  return (
    <MessageModal title={TEXTS.won.title(modal.errors)} buttons={endButtons}>
      <p>{TEXTS.won.body}</p>
      <ul className="mt-4 space-y-2">
        {companySummary(state).map(({ company, entryIds }) => (
          <li key={company} className="flex flex-wrap items-center gap-2">
            <CompanyChip company={company} />
            <span className="text-sm font-semibold text-sky-700">
              {entryIds.map((id) => getEntry(id)?.name).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </MessageModal>
  );
}

export default GameMessages;
