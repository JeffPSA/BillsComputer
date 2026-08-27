import { buildDeckText } from '../src/utils/deckExport';

const deck = {
  name: 'Export Test',
  requirements: [
    {
      requirement: { quantity: 2, requirementMode: 'SPECIFIC_PRINTING' },
      card: { name: 'Pikachu ex', supertype: 'Pokémon' },
      printing: { setCode: 'MEW', cardNumber: '94' },
      physicalPrintings: [
        { quantity: 1, printing: { id: 'por-107', setCode: 'POR', cardNumber: '107' } },
        { quantity: 1, printing: { id: 'por-121', setCode: 'POR', cardNumber: '121' } },
      ],
    },
    {
      requirement: { quantity: 4, requirementMode: 'ANY_PRINTING' },
      card: { name: 'Ultra Ball', supertype: 'Trainer' },
      printing: { setCode: 'SVI', cardNumber: '196' },
      physicalPrintings: [
        { quantity: 2, printing: { id: 'obf-172', setCode: 'OBF', cardNumber: '172' } },
      ],
    },
    {
      requirement: { quantity: 6, requirementMode: 'ANY_PRINTING' },
      card: { name: 'Basic Lightning Energy', supertype: 'Energy' },
      printing: { setCode: 'SVE', cardNumber: '4' },
    },
  ],
};

const live = buildDeckText(deck, 'PTCGL');
if (!live.includes('Pokémon: 2') || !live.includes('1 Pikachu ex POR 107') || !live.includes('1 Pikachu ex POR 121') || !live.endsWith('Total Cards: 12')) {
  throw new Error(`Unexpected Pokémon TCG Live export:\n${live}`);
}
if (live.includes('Pikachu ex MEW 94')) {
  throw new Error('Export used the imported/requirement printing instead of fully assigned physical printings');
}

const limitless = buildDeckText(deck, 'LIMITLESS');
if (!limitless.includes('2 Ultra Ball OBF 172') || !limitless.includes('2 Ultra Ball SVI 196')) {
  throw new Error(`Unexpected Limitless export:\n${limitless}`);
}

const tcgplayer = buildDeckText(deck, 'TCGPLAYER');
const tcgplayerLines = tcgplayer.split('\n');
if (!tcgplayerLines.includes('1 Pikachu ex [POR] 107') || !tcgplayerLines.includes('1 Pikachu ex [POR] 121') || !tcgplayerLines.includes('2 Ultra Ball [OBF] 172') || !tcgplayerLines.includes('2 Ultra Ball')) {
  throw new Error(`Unexpected TCGplayer export:\n${tcgplayer}`);
}
if (tcgplayer.includes('2 Ultra Ball [SVI]')) {
  throw new Error('ANY_PRINTING requirements should not force one TCGplayer printing');
}

console.log('✅ Deck text exports match Pokémon TCG Live, Limitless, and TCGplayer formats');
