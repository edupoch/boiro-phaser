import { useEffect, useState } from 'react';
import { gameState, type GameStateSnapshot } from '../game/GameState';

type TabId = 'tab-inicio' | 'tab-xogo1' | 'tab-xogo2' | 'tab-xogo3';

interface Tab {
  id: TabId;
  label: string;
  color: string;
}

const tabsList: Tab[] = [
  { id: 'tab-inicio', label: 'Inicio', color: 'bg-sky-400' },
  { id: 'tab-xogo1', label: 'Xogo 1', color: 'bg-orange-400' },
  { id: 'tab-xogo2', label: 'Xogo 2', color: 'bg-amber-400' },
  { id: 'tab-xogo3', label: 'Xogo 3', color: 'bg-sky-500' }
];

function GameModal() {
  const [activeTab, setActiveTab] = useState<TabId>('tab-inicio');
  const [gameSnapshot, setGameSnapshot] = useState<GameStateSnapshot>(() => gameState.getSnapshot());

  useEffect(() => {
    setGameSnapshot(gameState.getSnapshot());

    return gameState.subscribe(() => {
      setGameSnapshot(gameState.getSnapshot());
    });
  }, []);

  const playClickSound = () => {
    const audio = new Audio('/assets/audio/click.mp3');
    audio.play();
  };

  const handleComezamos = () => {
    setActiveTab('tab-xogo1');
    playClickSound();
  };

  const handleTabClick = (tabId: TabId) => {
    setActiveTab(tabId);
    playClickSound();
  };

  return (
    <div id="hud" className="fixed bottom-1/3 left-1/6 z-50 w-1/4 -translate-x-1/2 translate-y-1/2 overflow-hidden rounded-3xl border-4 border-white bg-white font-sans text-sky-950 shadow-2xl">
      {/* Navegación (Pestañas) */}
      <nav className="flex gap-2 overflow-x-auto border-b border-sky-100 bg-sky-50 p-4">
        {tabsList.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`rounded-2xl px-4 py-2 text-sm font-bold transition-all ${
              activeTab === tab.id
                ? `${tab.color} scale-105 text-white opacity-100 shadow-md`
                : 'scale-100 bg-white text-sky-600 opacity-60 hover:bg-sky-100 hover:opacity-100'
            }`}
          >
            {tab.label}
          </button>
        ))}

        <button
          onClick={playClickSound}
          className="ml-auto rounded-2xl bg-sky-100 px-3 py-2 text-sky-700 transition-all hover:bg-sky-200"
          aria-label="Configuración"
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
        {/* Pestaña INICIO */}
        {activeTab === 'tab-inicio' && (
          <div>
            <div className="flex items-start gap-5">
              <svg className="h-32 w-auto shrink-0 -rotate-3 transform drop-shadow-md" viewBox="2100 600 250 250" xmlns="http://www.w3.org/2000/svg">
                <g opacity="1" id="g445">
                    <g opacity="1" id="g444" style={{ fill: '#fdba74' }}>
                    <path
                        style={{ clipRule: 'evenodd' }}
                        d="m 2199.5537,789.76019 c -28.6414,-18.03346 -33.9453,-12.19915 -32.3542,-26.51979 1.5912,-14.32073 11.1384,-28.64144 3.1824,-33.41501 -7.956,-4.77356 -13.7903,-5.83435 -13.2599,-9.01673 0.5304,-3.18238 15.3815,-2.12159 0.5304,-13.79031 -14.8511,-11.66872 -22.2766,-10.07753 -16.4423,-21.74625 5.8344,-11.66872 12.7295,-23.33744 24.9287,-24.39823 12.1991,-1.06079 6.3647,-19.09427 32.3541,2.65198 25.9894,21.74625 44.5533,6.36475 35.5366,32.35418 -9.0168,25.98942 -10.0776,21.21585 -15.9119,31.82378 -5.8344,10.60793 -9.5472,15.91189 -14.3207,22.27665 -4.7736,6.36478 -9.0167,37.65816 -9.0167,37.65816 z"
                        id="path19"
                        fill="#000000"
                        opacity="0.15"></path><path
                        d="m 2258.76,681.022 c -7.51,19.954 -22.3,42.608 -22.3,42.608 0,0 -4.97,6.77-7.08,8.131 0,0 -9.43,-6.202 -9.27,-10.845 0.15,-4.644 25.96,-55.351 30.45,-55.295 4.48,0.056 10.54,8.932 10.85,10.712 0.31,1.781 4.86,-15.265 -2.65,4.689 z"
                        fill="#d9d7b7"
                        fill-rule="nonzero"
                        opacity="1"
                        stroke="#000000"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="3"
                        id="path437"
                        style={{ fill:'#fdba74'}}></path>
                    <path d="m 2203.14,734.272 c 0,0 -7.51,4.811 -7.08,9.759 0.44,4.947 6.86,6.754 6.86,6.754 l 16.46,-7.513 z" fill="#d9d7b7" fill-rule="nonzero" opacity="1" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" id="path438" style={{ fill:'#fdba74'}}></path>
                    <path
                        d="m 2224.22,721.885 c 3.45,6.504 16.2,16.477 12.19,22.897 -4.02,6.419 -30.85,18.787 -31.99,21.357 -1.14,2.57 -2.88,8.382 -1.11,12.373 1.76,3.991 9.33,13.152 2.64,14.99 -6.7,1.838 -13.61,-2.106 -15.66,-6.864 -2.05,-4.757 -5.06,-17.581 -3.07,-22.263 1.98,-4.683 22.55,-17.983 24.35,-19.868 1.8,-1.885 -14.53,-16.049 -16.71,-23.025 -2.17,-6.976 -0.79,-20.667 1.17,-25.107 1.95,-4.44 18.36,-32.285 23.41,-38.101 5.05,-5.816 15.35,-4.571 24.84,-2.917 9.5,1.655 16.27,1.727 21.16,0.479 4.89,-1.249 32.32,-18.293 37.4,-19.032 4.48,-0.651 15.37,-3.783 17.12,-1.712 1.28,1.509 5.63,2.615 7.36,5.008 4.8,6.681 -13.44,12.729 -18.55,11.311 -5.11,-1.419 -2.4,1.585 -9.18,0.25 -6.79,-1.335 -38.78,30.136 -40.94,27.571"
                        fill="#d9d7b7"
                        fill-rule="nonzero"
                        opacity="1"
                        stroke="#000000"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="3"
                        id="path439"
                        style={{ fill: '#fdba74' }}></path>
                    <path
                        d="m 2225.16,672.212 c 5.42,6.345 14.86,10.569 20.3,7.334 5.44,-3.234 6.86,-11.877 9.85,-18.639 2.99,-6.762 4.96,-15.767 -1.61,-21.455 -6.57,-5.688 -11.29,-8.512 -19.73,-4.872 -8.44,3.64 -13.17,6.328 -16.08,17.473 -2.91,11.144 -2.89,8.25 2.53,14.595"
                        fill="#d9d7b7"
                        fill-rule="nonzero"
                        opacity="1"
                        stroke="#000000"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="3"
                        id="path440"
                        style={{ fill: '#fdba74' }}></path>
                    <path
                        d="m 2194.97,702.078 c 8.28,5.813 17.3,14.344 27.87,13.485 10.57,-0.86 24.04,-9.477 24.04,-9.477 -11.87,23.112 -16.19,23.375 -16.19,23.375 0,0 -17.15,-8.719 -21.9,8.886 0,0 -9.67,-7.934 -13.11,-16.135 -3.43,-8.202 -0.71,-20.134 -0.71,-20.134 z"
                        fill="#c0cad8"
                        fill-rule="nonzero"
                        opacity="1"
                        stroke="#000000"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="3"
                        id="path441"
                        style={{ fill: '#0ea5e9' }}></path>
                    <path
                        d="m 2217.67,663.169 c -6.26,4.581 -20.71,-5.919 -32.67,-1.467 -11.96,4.451 -13.17,8.851 -19.03,17.302 -5.87,8.451 -7.35,-2.321 -18.82,5.832 -1.63,1.154 -8.97,13.913 -0.86,18.412 11.83,6.564 24.72,-8.177 28.66,-13.961 3.95,-5.784 8.34,-6.711 13.2,-9.842 4.85,-3.132 21.98,8.673 25.04,5.334"
                        fill="#d9d7b7"
                        fill-rule="nonzero"
                        opacity="1"
                        stroke="#000000"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="3"
                        id="path442"
                        style={{ fill: '#fdba74' }}></path>
                    <path d="m 2230.29,729.286 -5.9,-9.01" fill="none" opacity="1" stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" id="path443" style={{ fill: '#fdba74' }}></path>
                    <path
                        d="m 2221.05,667.226 c -6.88,-1.616 -11.63,-1.293 -6.12,-8.818 5.51,-7.524 3.06,-2.996 4.36,-10.02 1.29,-7.025 -4.74,-12.803 1.17,-10.63 5.91,2.173 0.35,-2.876 13.15,-6.713 12.81,-3.838 15.58,-5.411 14,1.131 -1.57,6.542 -1.26,1.193 8.06,1.086 9.33,-0.106 14.21,8.675 8.07,12.195 -6.15,3.521 -4.74,3.018 -2.62,8.66 2.12,5.643 1.6,12.76 -3.09,11.633 -4.69,-1.128 -1.31,-2.178 -7.01,-0.511 -5.7,1.668 -1.51,5.989 -9.37,3.244 -7.86,-2.745 -13.5,-12.629 -13.66,-6.701 -0.16,5.928 -2.54,15.402 -4.85,10.41 -2.31,-4.992 4.78,-3.349 -2.09,-4.966 z"
                        fill="#eebf5b"
                        fill-rule="nonzero"
                        opacity="1"
                        stroke="#000000"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="3"
                        id="path444"
                        style={{ fill: '#fcd34d' }}></path>
                    </g>
                </g>
                </svg>
              <h2 className="my-auto text-4xl leading-tight font-extrabold tracking-tight text-sky-500">Máis cerca<br />do que pensas</h2>
            </div>
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm leading-relaxed font-medium text-sky-500">Explora as nosas instalacións e navega polo noso ecosistema dixital. Selecciona un dos xogos no panel superior para comezar a interactuar co mapa.</p>
              <div>
                <div className="flex justify-end">
                  <button
                    id="btn-comezamos"
                    onClick={handleComezamos}
                    className="mt-6 rounded-2xl bg-amber-400 px-8 py-3 text-lg font-extrabold text-white shadow-lg transition-transform hover:scale-105 hover:bg-amber-300"
                  >
                    Comecemos!
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pestaña XOGO 1 */}
        {activeTab === 'tab-xogo1' && (
          <div className="space-y-4 text-left">
            <div className="text-center">
              <p className="text-sky-600 font-semibold">Atopa os obxectos!</p>
              <p className="mt-1 text-sm text-sky-500">
                Quédanche {gameSnapshot.remaining} de {gameSnapshot.totalToFind}
              </p>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-2xl bg-sky-50 p-4">
              <ul className="space-y-2">
                {gameSnapshot.targets.map((target) => (
                  <li key={target.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 shadow-sm">
                    <div>
                      <p className="text-sm font-bold text-sky-800">{target.name}</p>
                    </div>
                    <span className="text-sm font-semibold text-sky-600">
                      {target.found}/{target.total}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Pestaña XOGO 2 */}
        {activeTab === 'tab-xogo2' && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 py-8 text-center">
            <span className="mb-3 text-4xl">🚧</span>
            <p className="text-xs font-bold tracking-widest text-amber-500 uppercase">Módulo en construción</p>
          </div>
        )}

        {/* Pestaña XOGO 3 */}
        {activeTab === 'tab-xogo3' && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50 py-8 text-center">
            <span className="mb-3 text-4xl">🚀</span>
            <p className="text-xs font-bold tracking-widest text-sky-500 uppercase">Proximamente</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default GameModal;
