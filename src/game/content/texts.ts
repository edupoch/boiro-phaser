// Textos de la interfaz en gallego. Los de cada objeto están en catalog.ts.

export const plural = (count: number, singular: string, pluralForm: string): string =>
    `${count} ${count === 1 ? singular : pluralForm}`;

export const TEXTS = {
    tabs: {
        home: 'Inicio',
        game: 'Xogo',
        gameLevel: (level: number, levels: number) => `Xogo ${level}/${levels}`,
        explore: 'Exploración',
        settings: 'Axustes',
    },
    home: {
        intro: 'Explora as nosas instalacións e descubre o que fabrican as nosas empresas. Pulsa «Comecemos!» para xogar ou vai a Exploración para percorrer o mapa ao teu aire.',
        start: 'Comecemos!',
        continue: 'Continuar xogando',
        restart: 'Reiniciar xogo',
    },
    explore: {
        intro: 'Podes explorar o escenario e clicar nos obxectos para aprender sobre eles sen límite. Esta información virache moi ben para os xogos ;)',
    },
    objectives: {
        level1: 'Atopa estes obxectos!',
        level2: 'Descifra as pistas e atopa os obxectos!',
        level3: 'Atopa os obxectos fabricados por:',
        objects: (found: number, total: number) => `${found}/${total} obxectos`,
    },
    ficha: {
        defaultHeadline: 'Atopáchelo!',
        levelComplete: 'Completaches o nivel!',
        didYouKnow: 'Sabías que...',
        madeBy: 'Fabricado por',
        continueGame: 'Continuar xogando',
        continueExplore: 'Continuar explorando',
        nextLevel: (level: number) => `Pasar ao nivel ${level}`,
    },
    wrong: {
        title: 'Obxecto incorrecto!',
        attemptsLeft: (attempts: number) =>
            attempts === 1 ? 'Quédache 1 intento' : `Quédanche ${attempts} intentos`,
        continue: 'Continuar xogando',
    },
    lost: {
        title: 'Perdiches!',
        body: 'Esgotaches todos os intentos',
    },
    won: {
        title: (errors: number) => `Completaches o xogo con ${plural(errors, 'erro', 'erros')}!`,
        body: 'Xa sabes máis da nosa empresa ca nós :)',
    },
    endButtons: {
        playAgain: 'Volver a xogar',
        explore: 'Explorar o mapa',
    },
    confirm: {
        title: 'Seguro?',
        loseProgress: 'Isto fará que perdas todos os teus avances',
        newGame: 'Isto fará que comeces unha nova partida',
        yes: 'Si',
        no: 'Non',
    },
    idle: {
        title: 'Segues aí?',
        countdown: (seconds: number) => `Volvemos ao inicio en ${seconds} s`,
        stay: 'Sigo aquí',
    },
    settings: {
        ambient: 'Volume do son ambiente',
        effects: 'Volume dos efectos de son',
        music: 'Volume da música',
    },
} as const;
