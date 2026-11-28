// Thema's: "ingame" (steen/goud voor OSRS, staal/goud voor RS3, echte game-plaatjes) of "strak" (het oude, minimale).
export const themeOf = (settings) => (settings?.theme === 'strak' ? 'strak' : 'ingame');

export const INGAME_ACCENT = {
  osrs: { accent: '#FFB83F', soft: 'rgba(255,184,63,.14)', ink: '#2A1A05' },
  rs3: { accent: '#F0C15A', soft: 'rgba(240,193,90,.14)', ink: '#2A1A05' },
};

const WIKI = { osrs: 'https://oldschool.runescape.wiki', rs3: 'https://runescape.wiki' };
export const wikiFile = (game, file) => `${WIKI[game] || WIKI.osrs}/images/${encodeURIComponent(file.replace(/ /g, '_'))}`;

// Muntenstapel zoals in de game: het plaatje groeit mee met het bedrag
const COIN_STEPS = [[10000, 10000], [1000, 1000], [250, 250], [100, 100], [25, 25], [5, 5], [4, 4], [3, 3], [2, 2], [1, 1]];
export function coinsFile(n) {
  const a = Math.abs(Number(n) || 0);
  for (const [min, f] of COIN_STEPS) if (a >= min) return `Coins_${f}.png`;
  return 'Coins_1.png';
}
// In-game kleuren voor bedragen: geel, wit vanaf 100K, groen vanaf 10M
export const gpTone = (n) => {
  const a = Math.abs(Number(n) || 0);
  return a >= 1e7 ? 'm' : a >= 1e5 ? 'k' : 'y';
};

export const skillCapeFile = (game, skill) => `${skill}_cape.png`;
export const questIconFile = (game) => (game === 'rs3' ? 'Quest.png' : 'Quest_point_icon.png');
export const npcFile = () => 'Hans_chathead.png';
