import type { ReactNode } from 'react';
import { CLUES, getEntry, type CompanyId } from '../game/content/catalog';
import { TEXTS } from '../game/content/texts';
import { LEVEL_COUNT, objectiveFound, type GameState, type Objective } from '../game/play/gameReducer';
import CompanyChip from './CompanyChip';
import HomeIllustration from './HomeIllustration';

export type TabId = 'inicio' | 'xogo' | 'exploracion' | 'axustes';

interface HudProps {
  state: GameState;
  activeTab: TabId;
  onTabClick: (tab: TabId) => void;
  onStart: () => void;
  onContinue: () => void;
  onRestart: () => void;
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

const levelIntro: Record<number, string> = {
  1: TEXTS.objectives.level1,
  2: TEXTS.objectives.level2,
  3: TEXTS.objectives.level3,
};

function ObjectiveRow({ objective }: { objective: Objective }) {
  const found = objectiveFound(objective);
  const done = found >= objective.total;
  let content: ReactNode = null;

  if (objective.kind === 'type') {
    const entry = getEntry(objective.refId);
    const name = objective.total === 1 ? lowerFirst(entry?.name ?? '') : entry?.plural;
    content = <p className="text-sm font-bold text-sky-800">{found}/{objective.total} {name}</p>;
  } else if (objective.kind === 'clue') {
    const clue = CLUES.find((candidate) => candidate.id === objective.refId);
    content = (
      <>
        <p className="text-sm font-bold text-sky-800">{clue?.text}</p>
        <p className="mt-1 text-sm font-semibold text-sky-600">{TEXTS.objectives.objects(found, objective.total)}</p>
      </>
    );
  } else {
    content = (
      <div className="flex items-center justify-between gap-3">
        <CompanyChip company={objective.refId as CompanyId} />
        <p className="text-sm font-semibold text-sky-600">{TEXTS.objectives.objects(found, objective.total)}</p>
      </div>
    );
  }

  return (
    <li className={`flex items-center gap-2 rounded-xl px-3 py-2 shadow-sm ${done ? 'bg-lime-100' : 'bg-white'}`}>
      <div className="min-w-0 flex-1">{content}</div>
      {done && <span className="text-lg font-extrabold text-lime-600" aria-label="Completado">✓</span>}
    </li>
  );
}

function Hud({ state, activeTab, onTabClick, onStart, onContinue, onRestart }: HudProps) {
  const gameLabel = state.mode === 'game' ? TEXTS.tabs.gameLevel(state.level, LEVEL_COUNT) : TEXTS.tabs.game;

  const tabsList: { id: Exclude<TabId, 'axustes'>; label: string; color: string }[] = [
    { id: 'inicio', label: TEXTS.tabs.home, color: 'bg-sky-400' },
    { id: 'xogo', label: gameLabel, color: 'bg-orange-400' },
    { id: 'exploracion', label: TEXTS.tabs.explore, color: 'bg-amber-400' },
  ];

  return (
    <div id="hud" className="fixed bottom-1/3 left-1/6 z-50 w-1/4 -translate-x-1/2 translate-y-1/2 overflow-hidden rounded-3xl border-4 border-white bg-white font-sans text-sky-950 shadow-2xl">
      {/* Navegación (Pestañas) */}
      <nav className="flex gap-2 overflow-x-auto border-b border-sky-100 bg-sky-50 p-4">
        {tabsList.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            className={`rounded-2xl px-4 py-2 text-sm font-bold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? `${tab.color} scale-105 text-white opacity-100 shadow-md`
                : 'scale-100 bg-white text-sky-600 opacity-60 hover:bg-sky-100 hover:opacity-100'
            }`}
          >
            {tab.label}
          </button>
        ))}

        <button
          onClick={() => onTabClick('axustes')}
          className={`ml-auto rounded-2xl px-3 py-2 transition-all ${
            activeTab === 'axustes' ? 'bg-sky-500 text-white shadow-md' : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
          }`}
          aria-label={TEXTS.tabs.settings}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </nav>

      {/* Paneles de Contenido */}
      <div className="relative px-6 py-8">
        {activeTab === 'inicio' && (
          <div>
            <div className="flex items-start gap-5">
              <HomeIllustration />
              <h2 className="my-auto text-4xl leading-tight font-extrabold tracking-tight text-sky-500">Máis cerca<br />do que pensas</h2>
            </div>
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm leading-relaxed font-medium text-sky-500">{TEXTS.home.intro}</p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                {state.mode === 'game' ? (
                  <>
                    <button
                      onClick={onRestart}
                      className="rounded-2xl bg-sky-100 px-6 py-3 text-lg font-extrabold text-sky-700 transition-transform hover:scale-105 hover:bg-sky-200"
                    >
                      {TEXTS.home.restart}
                    </button>
                    <button
                      onClick={onContinue}
                      className="rounded-2xl bg-amber-400 px-6 py-3 text-lg font-extrabold text-white shadow-lg transition-transform hover:scale-105 hover:bg-amber-300"
                    >
                      {TEXTS.home.continue}
                    </button>
                  </>
                ) : (
                  <button
                    id="btn-comezamos"
                    onClick={onStart}
                    className="rounded-2xl bg-amber-400 px-8 py-3 text-lg font-extrabold text-white shadow-lg transition-transform hover:scale-105 hover:bg-amber-300"
                  >
                    {TEXTS.home.start}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'xogo' && state.mode === 'game' && (
          <div className="space-y-4 text-left">
            <p className="text-center font-semibold text-sky-600">{levelIntro[state.level]}</p>
            <div className="max-h-72 overflow-y-auto rounded-2xl bg-sky-50 p-4">
              <ul className="space-y-2">
                {state.objectives.map((objective) => (
                  <ObjectiveRow key={`${objective.kind}-${objective.refId}`} objective={objective} />
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'exploracion' && (
          <p className="text-sm leading-relaxed font-medium text-sky-500">{TEXTS.explore.intro}</p>
        )}
      </div>
    </div>
  );
}

export default Hud;
