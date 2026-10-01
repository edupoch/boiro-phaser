// Catálogo del juego: empresas, fichas de objeto y pistas.
// La redacción vive en docs/content/objetos.md y docs/content/pistas.md; aquí se copia ya limpia
// (la exclamación inicial pasa a `headline` y el "Sabías que…?" se convierte en afirmación).
import { GAME_CONFIG } from '../config.ts';
import { spriteCountByToken } from './sprites.ts';

export type CompanyId = 'rotogal' | 'egalsa' | 'jjchicolino' | 'oziona';

export interface Company {
    name: string;
    // Color de la etiqueta, tomado de la paleta de escena.svg.
    color: string;
}

export interface CatalogEntry {
    id: string;
    name: string;
    plural: string;
    company: CompanyId;
    headline: string;
    text: string;
    // Tokens `ob_*` de los sprites de la escena que muestran esta ficha.
    spriteTokens: string[];
}

export interface Clue {
    id: string;
    text: string;
    entryIds: string[];
}

export const COMPANIES: Record<CompanyId, Company> = {
    rotogal: { name: 'Rotogal', color: '#ea580c' },
    egalsa: { name: 'Egalsa', color: '#2e6777' },
    jjchicolino: { name: 'JJ Chicolino', color: '#0369a1' },
    oziona: { name: 'Oziona', color: '#65a30d' },
};

export const COMPANY_IDS = Object.keys(COMPANIES) as CompanyId[];

export const ENTRIES: CatalogEntry[] = [
    // Rotogal
    {
        id: 'contedor',
        name: 'Contedor',
        plural: 'contedores',
        company: 'rotogal',
        headline: 'Que guai! 🎉',
        text: 'Este tipo de contedores poden acabar viaxando por terra e mar. 🌊 En Rotogal o fan mediante rotomoldeo para que aguanten o trote.',
        spriteTokens: ['ob_contenedor'],
    },
    {
        id: 'carro',
        name: 'Carro cutter',
        plural: 'carros cutter',
        company: 'rotogal',
        headline: '👀 Mira o que atopaches!',
        text: 'Este carro ten capacidade para 200 litros e as súas rodas son moi silenciosas. 🤫 En Rotogal o fan de polietileno e está pensado para o seu uso na industria alimentaria.',
        spriteTokens: ['ob_carro'],
    },
    {
        id: 'palet',
        name: 'Palet',
        plural: 'palets',
        company: 'rotogal',
        headline: 'Que crack! 🎉',
        text: 'Un palet pode soportar cargas de ata 2.000 kg. 💪 En Rotogal fabrícanos en plástico mediante rotomoldeo, pensados para facilitar o transporte e almacenamento de todo tipo de produtos.',
        spriteTokens: ['ob_pale_plastico', 'ob_pale_porex'],
    },
    {
        id: 'barreira',
        name: 'Barreira New Jersey',
        plural: 'barreiras New Jersey',
        company: 'rotogal',
        headline: '🚧 Mira o que apareceu!',
        text: 'Esta barreira pode inclinarse ata 40º sen perder estabilidade. 😮 En Rotogal fabrícana mediante rotomoldeo e está pensada para crear desvíos, medianas e sinalizacións provisionais.',
        spriteTokens: ['ob_newjersey'],
    },
    // Egalsa
    {
        id: 'caixa_madeira',
        name: 'Caixa de madeira',
        plural: 'caixas de madeira',
        company: 'egalsa',
        headline: '🧐 Boa vista!',
        text: 'Ollo, porque non está aquí só de adorno: en Egalsa fabrícanas con madeira de chopo e utilízanse para envasar desde marisco ata froitas, hortalizas ou viño. 🍷🦪',
        spriteTokens: ['ob_caja_madera'],
    },
    {
        id: 'malla',
        name: 'Malla',
        plural: 'mallas',
        company: 'egalsa',
        headline: '🕵️‍♀️ Ben atopada!',
        text: 'As mallas permiten protexer os produtos sen deixar de lado a ventilación. 🌱 En Egalsa ofrecen diferentes tipos de mallas para alimentos, moluscos, cultivos mariños e moito máis.',
        spriteTokens: ['ob_malla_limones', 'ob_malla_naranjas'],
    },
    // JJ Chicolino
    {
        id: 'saco',
        name: 'Saco',
        plural: 'sacos',
        company: 'jjchicolino',
        headline: '🦪 Atopaches os sacos!',
        text: 'Utilízanse para o cultivo do mexillón. 🌊 En JJ Chicolino teñen sacos de diferentes materiais e tamaños, pensados para distintas fases do cultivo.',
        spriteTokens: ['ob_saco_malla'],
    },
    {
        id: 'boia',
        name: 'Boia',
        plural: 'boias',
        company: 'jjchicolino',
        headline: '🌊 Atopaches unha boia!',
        text: 'Algunhas das boias de JJ Chicolino están fabricadas en polietileno mediante rotomoldeo e están pensadas para resistir a oleaxe e as correntes. 💪',
        spriteTokens: ['ob_boya', 'ob_boya_amarilla'],
    },
    {
        id: 'ancora',
        name: 'Áncora',
        plural: 'áncoras',
        company: 'jjchicolino',
        headline: '⚓ Aquí hai algo que pesa!',
        text: 'As áncoras son fundamentais para manter as estruturas de cultivo no seu sitio. 🌊 En JJ Chicolino ofrecen diferentes solucións de fondeo para sistemas de acuicultura.',
        spriteTokens: ['ob_ancla'],
    },
    {
        id: 'corda_cultivo',
        name: 'Corda de cultivo',
        plural: 'cordas de cultivo',
        company: 'jjchicolino',
        headline: '🪢 Aquí está unha das claves do cultivo do mexillón!',
        text: 'Estas cordas son as que permiten que o mexillón medre suspendido baixo as bateas. 🦪 En JJ Chicolino fabrican cordas específicas para diferentes sistemas de cultivo.',
        spriteTokens: ['ob_cuerda'],
    },
    // Oziona
    {
        id: 'banco',
        name: 'Banco',
        plural: 'bancos',
        company: 'oziona',
        headline: '🪑 Pequeno descanso?',
        text: 'Os bancos tamén forman parte do mobiliario urbano e deportivo que instala Oziona. 🌳 Poden formar parte de parques, zonas deportivas e espazos públicos.',
        spriteTokens: ['ob_banco_jardinera', 'ob_banco_ola'],
    },
    {
        id: 'papeleira',
        name: 'Papeleira',
        plural: 'papeleiras',
        company: 'oziona',
        headline: '🗑️ Aquí hai outra!',
        text: 'As papeleiras tamén forman parte do mobiliario que atopamos nos espazos públicos. 🌳 En Oziona ofrecen diferentes modelos pensados para parques, zonas deportivas e outros espazos ao aire libre.',
        spriteTokens: ['ob_papelera'],
    },
    {
        id: 'fonte',
        name: 'Fonte',
        plural: 'fontes',
        company: 'oziona',
        headline: '💧 Unha paradiña para beber!',
        text: 'As fontes tamén forman parte do equipamento dos espazos públicos. 🚰 En Oziona instalan fontes pensadas para parques, zonas deportivas e outros espazos ao aire libre.',
        spriteTokens: ['ob_fuente'],
    },
    {
        id: 'parque_canino',
        name: 'Parque canino',
        plural: 'parques caninos',
        company: 'oziona',
        headline: '🐶 Aquí tamén hai sitio para os cans!',
        text: 'Os parques caninos poden contar con diferentes elementos para que os cans xoguen, corran e fagan exercicio. 🐾 En Oziona deseñan e instalan estes espazos para que tamén desfruten ao aire libre.',
        spriteTokens: ['ob_canodromo'],
    },
];

export const CLUES: Clue[] = [
    {
        id: 'froita',
        text: 'Busca algo para levar froita dun sitio a outro.',
        entryIds: ['caixa_madeira', 'contedor', 'palet', 'carro'],
    },
    {
        id: 'almacen',
        text: 'Sen min, o almacén sería un caos: levo, apilo e movo cargas.',
        entryIds: ['palet', 'carro', 'contedor'],
    },
    {
        id: 'mar',
        text: 'Estou no mar, non me afundo, e nunca vou a ningures.',
        entryIds: ['boia'],
    },
    // Pendientes hasta que haya sprites `ob_*` suficientes en la escena:
    // 'Busca todo o que che permitiría pasar unha tarde divertida na auga.' → kayaks, plataformas para motos de auga
    // 'Somos primos: todos parecemos cordas, pero cada un ten o seu traballo. Atópanos a todos!' → cabos, rabizas, corda de cultivo, redes
    // 'Busca cousas que axuden a manter algo no seu sitio' → cadea, áncoras, rabizas
];

const entryById = new Map(ENTRIES.map((entry) => [entry.id, entry]));
const entryByToken = new Map(ENTRIES.flatMap((entry) => entry.spriteTokens.map((token) => [token, entry] as const)));

export const getEntry = (id: string): CatalogEntry | undefined => entryById.get(id);

export const getEntryForToken = (token: string): CatalogEntry | undefined => entryByToken.get(token);

// Sprites de la escena que muestran esta ficha.
export const spriteCountForEntry = (entry: CatalogEntry): number =>
    entry.spriteTokens.reduce((sum, token) => sum + (spriteCountByToken.get(token) ?? 0), 0);

// Unidades que se piden de una ficha en un objetivo.
export const entryCap = (entry: CatalogEntry): number =>
    Math.min(spriteCountForEntry(entry), GAME_CONFIG.maxPerTarget);

export const totalForEntries = (entryIds: string[]): number =>
    entryIds.reduce((sum, id) => {
        const entry = getEntry(id);
        return sum + (entry ? entryCap(entry) : 0);
    }, 0);

export const entryIdsForCompany = (company: CompanyId): string[] =>
    ENTRIES.filter((entry) => entry.company === company).map((entry) => entry.id);
