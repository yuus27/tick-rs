// Alles wat per game verschilt staat hier, zodat de rest van de app één codebase blijft.

const OSRS_SKILLS = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecraft', 'Hunter', 'Construction', 'Sailing'];
const RS3_SKILLS = ['Attack', 'Strength', 'Defence', 'Constitution', 'Ranged', 'Prayer', 'Magic', 'Necromancy', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecrafting', 'Hunter', 'Construction', 'Summoning', 'Dungeoneering', 'Divination', 'Invention', 'Archaeology'];

const OSRS_F2P = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Runecraft'];
const RS3_F2P = ['Attack', 'Strength', 'Defence', 'Constitution', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Runecrafting', 'Dungeoneering'];

const MELEE = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Constitution'];

export const GAMES = {
  osrs: {
    id: 'osrs',
    label: 'Old School',
    short: 'OSRS',
    accent: '#F0B95A',
    accentSoft: 'rgba(240,185,90,.12)',
    accentInk: '#1A1408',
    wikiBase: 'https://oldschool.runescape.wiki',
    skills: OSRS_SKILLS,
    f2p: OSRS_F2P,
    maxLevel: 99,
    questSourceName: 'WikiSync (RuneLite-plugin)',
    pages: {
      questList: ['Quests/List', 'Quests'],
      optimal: ['Optimal quest guide'],
      money: ['Money making guide'],
      questXp: ['Quest experience rewards'],
      main: 'Old School RuneScape Wiki',
    },
    skillIcon: (s) => `https://oldschool.runescape.wiki/images/${encodeURIComponent(s.replace(/ /g, '_'))}_icon.png`,
    tax: (sell) => (sell < 50 ? 0 : Math.min(Math.floor(sell * 0.02), 5_000_000)),
    taxLabel: '2% (max 5M, niets onder 50 gp)',
  },
  rs3: {
    id: 'rs3',
    label: 'RuneScape 3',
    short: 'RS3',
    accent: '#5CC8FF',
    accentSoft: 'rgba(92,200,255,.12)',
    accentInk: '#03131B',
    wikiBase: 'https://runescape.wiki',
    skills: RS3_SKILLS,
    f2p: RS3_F2P,
    maxLevel: 99,
    questSourceName: 'WikiSync (RS3 Plugin Hub)',
    pages: {
      questList: ['List of quests', 'Quests/List', 'Quests'],
      optimal: ['Optimal quest guide'],
      money: ['Money making guide'],
      questXp: ['Quest experience rewards', 'Quests/Experience rewards'],
      main: 'RuneScape Wiki',
    },
    skillIcon: (s) => (s === 'Combat' ? 'https://runescape.wiki/images/Combat_swords.png' : s === 'Melee' ? 'https://runescape.wiki/images/Attack-icon.png' : `https://runescape.wiki/images/${encodeURIComponent(s.replace(/ /g, '_'))}-icon.png`),
    // RS3-regels wijken af; het percentage stel je in bij Instellingen.
    tax: (sell, settings) => {
      const pct = Number(settings?.rs3TaxPct ?? 0);
      return pct > 0 ? Math.floor(sell * pct / 100) : 0;
    },
    taxLabel: 'instelbaar (Instellingen)',
  },
};

export function guideCandidates(game, skill, mode) {
  const melee = MELEE.includes(skill);
  if (game === 'osrs') {
    if (mode === 'p2p') return [`Pay-to-play ${skill} training`, ...(melee ? ['Pay-to-play melee training'] : []), `${skill} training`];
    if (mode === 'f2p') return [`Free-to-play ${skill} training`, ...(melee ? ['Free-to-play melee training'] : [])];
    if (mode === 'iron') return [`Ironman Guide/${skill}`, `Ironman guide/${skill}`, `${skill} training/Ironman`, 'Ironman Guide'];
    return [skill];
  }
  // RS3: "<Skill> training" is vaak een doorverwijspagina; de echte guide heet "Pay-to-play <Skill> training"
  if (mode === 'p2p') return [`Pay-to-play ${skill} training`, ...(melee ? ['Pay-to-play melee training'] : []), `${skill} training`];
  if (mode === 'f2p') return melee ? ['Free-to-play melee training', `Free-to-play ${skill} training`] : [`Free-to-play ${skill} training`];
  if (mode === 'iron') return [`Ironman Mode/Guide/${skill}`, `${skill} training/Ironman`, 'Ironman Mode/Guide', 'Ironman Mode'];
  return [skill];
}

export const SKILL_COLORS = {
  Attack: '#E0745C', Strength: '#4FBF7F', Defence: '#7C9BE0', Hitpoints: '#E56B6B', Constitution: '#E56B6B', Ranged: '#8DBF4F', Prayer: '#E8E0C0', Magic: '#7C8BF0', Necromancy: '#B07CE8',
  Cooking: '#C07CE0', Woodcutting: '#9AAE6A', Fletching: '#4FB7A8', Fishing: '#6CB4E8', Firemaking: '#F0954A', Crafting: '#C9A27A', Smithing: '#A9B0BB', Mining: '#8A9EAD',
  Herblore: '#5FCB6F', Agility: '#6C8FE0', Thieving: '#B47CC4', Slayer: '#D45B5B', Farming: '#6FBF5A', Runecraft: '#D8C27A', Runecrafting: '#D8C27A', Hunter: '#B79A6A',
  Construction: '#C9A27A', Sailing: '#4FB7D8', Summoning: '#5FC8C0', Dungeoneering: '#9C7A5A', Divination: '#9F8CF0', Invention: '#F0C24A', Archaeology: '#C98A5A',
};
