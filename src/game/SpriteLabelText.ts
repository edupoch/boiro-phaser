export const spriteLabelTextMap: Record<string, string> = {
    ob_alcantarilla: 'Alcantarilla',
    ob_ancla: 'Áncora',
    ob_banco: 'Banco',
    ob_bigbag: 'Big bag',
    ob_bolardo: 'Bolardo',
    ob_botas: 'Botas',
    ob_boya: 'Boia',
    ob_caja_madera: 'Caixa de madeira',
    ob_caja_plastico: 'Caixa de plástico',
    ob_caja_porex: 'Caixa de pórex',
    ob_canodromo: 'Canódromo',
    ob_carro: 'Carro',
    ob_cono: 'Cono',
    ob_contenedor: 'Contedor',
    ob_cubo: 'Cubo',
    ob_cuerda: 'Corda',
    ob_cupula: 'Cúpula',
    ob_faro: 'Faro',
    ob_fuente: 'Fonte',
    ob_macetero: 'Maceteiro',
    ob_malla: 'Malla',
    ob_newjersey: 'Barreira New Jersey',
    ob_pala: 'Pala',
    ob_pale: 'Palet',
    ob_panel_porex: 'Panel de pórex',
    ob_papelera: 'Papeleira',
    ob_saco_malla: 'Saco de malla',
};

export const getSpriteLabelText = (label: string): string | undefined => {
    for (const [token, text] of Object.entries(spriteLabelTextMap)) {
        if (label.includes(token)) {
            return text;
        }
    }

    return undefined;
};
