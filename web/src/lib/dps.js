// OSRS DPS-berekening (vereenvoudigd): melee, ranged en magic met de formules van de wiki.
// Telt de grote modifiers mee (salve, slayer helm, void, dragonbane, demonbane, twisted bow, crystal-set,
// powered staves); speciale set-effecten (inquisitor, obsidian, Torag, etc.) en special attacks niet.

export const SLOTS = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'];
export const SLOT_NL = { head: 'Hoofd', cape: 'Cape', neck: 'Nek', ammo: 'Ammo', weapon: 'Wapen', body: 'Body', shield: 'Schild', legs: 'Legs', hands: 'Handen', feet: 'Voeten', ring: 'Ring' };
export const STYLES = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic' };

const T = ['stab', 'slash', 'crush', 'magic', 'ranged'];
const has = (gear, re) => SLOTS.some((s) => gear[s] && re.test(gear[s].n));
const nm = (gear, slot) => gear[slot]?.n || '';

// Spreuken: [naam, basis max hit, magic level]
const STANDARD = [['Fire Surge', 24, 95], ['Fire Wave', 20, 75], ['Fire Blast', 16, 59], ['Fire Bolt', 12, 35], ['Fire Strike', 8, 13], ['Wind Strike', 2, 1]];
const ANCIENT = [['Ice Barrage', 30, 94], ['Blood Barrage', 29, 92], ['Ice Blitz', 26, 82], ['Ice Burst', 22, 70], ['Ice Rush', 18, 58], ['Smoke Rush', 13, 50]];

// Powered staves: max hit uit je magic level
function poweredMax(name, mag) {
  const n = name.toLowerCase();
  if (n.startsWith("tumeken's shadow")) return Math.floor(mag / 3) + 1;
  if (n.startsWith('sanguinesti staff') || n.startsWith('holy sanguinesti')) return Math.floor(mag / 3) - 1;
  if (n.startsWith('trident of the swamp')) return Math.floor(mag / 3) - 2;
  if (n.startsWith('trident of the seas')) return Math.floor(mag / 3) - 5;
  if (n.startsWith("warped sceptre")) return Math.floor((8 * mag + 96) / 37);
  if (n.startsWith('accursed sceptre')) return Math.floor(mag / 3) - 6;
  if (n.startsWith("thammaron's sceptre")) return Math.floor(mag / 3) - 8;
  if (n.startsWith('eye of ayak')) return Math.floor(mag / 3) - 6;
  return Math.floor(mag / 3) - 5;
}

function hitChance(atk, def) {
  return atk > def ? 1 - (def + 2) / (2 * (atk + 1)) : atk / (2 * (def + 1));
}

function sumBonuses(gear) {
  const o = [0, 0, 0, 0, 0];
  const b = [0, 0, 0, 0];
  for (const s of SLOTS) {
    const it = gear[s];
    if (!it) continue;
    it.o.forEach((v, i) => { o[i] += v; });
    it.b.forEach((v, i) => { b[i] += v; });
  }
  return { o, b };
}

// boosts: { pot: bool, pray: bool, task: bool, spellbook: 'standard'|'ancient' }
export function calcDps(style, gear, lv, monster, boosts = {}) {
  if (!monster) return null;
  const w = gear.weapon;
  const { o, b } = sumBonuses(gear);
  const attrs = (monster.a || []).map((x) => String(x).toLowerCase());
  const undead = attrs.includes('undead');
  const dragon = attrs.includes('dragon');
  const demon = attrs.includes('demon');
  const salveE = /^Salve amulet ?\(ei\)|^Salve amulet\(e\)/i.test(nm(gear, 'neck'));
  const salveI = /^Salve amulet ?\(i\)/i.test(nm(gear, 'neck'));
  const salve = /^Salve amulet$/i.test(nm(gear, 'neck'));
  const helm = nm(gear, 'head');
  const slayerI = /^(Slayer helmet|Black mask).*\(i\)/i.test(helm);
  const slayer = /^(Slayer helmet|Black mask)/i.test(helm);
  const voidTop = /^(Elite void top|Void knight top)/i.test(nm(gear, 'body'));
  const voidLegs = /^(Elite void robe|Void knight robe)/i.test(nm(gear, 'legs'));
  const voidGloves = /^Void knight gloves/i.test(nm(gear, 'hands'));
  const elite = /^Elite void top/i.test(nm(gear, 'body')) && /^Elite void robe/i.test(nm(gear, 'legs'));
  const voidBase = voidTop && voidLegs && voidGloves;
  const voidOf = (re) => voidBase && re.test(helm);

  const notes = [];
  let accM = 1;
  let dmgM = 1;
  let maxHit = 0;
  let atkRoll = 0;
  let defRoll = 0;
  let speed = w?.sp || 4;
  let typeName = '';

  // Salve gaat boven slayer helm
  const undeadBonus = (kind) => {
    if (!undead) return 0;
    if (kind === 'melee') return salveE ? 1.2 : salve || salveI ? 7 / 6 : 0;
    return salveE ? 1.2 : salveI ? 1.15 : 0;
  };
  const taskBonus = (kind) => {
    if (!boosts.task) return 0;
    if (kind === 'melee') return slayer ? 7 / 6 : 0;
    return slayerI ? 1.15 : 0;
  };
  const gearMult = (kind) => {
    const s = undeadBonus(kind);
    if (s) { notes.push('Salve'); return s; }
    const t = taskBonus(kind);
    if (t) { notes.push('Slayer helm'); return t; }
    return 1;
  };

  if (style === 'melee') {
    const pot = boosts.pot ? (x) => x + 5 + Math.floor(x * 0.15) : (x) => x;
    const pA = boosts.pray ? 1.2 : 1;
    const pS = boosts.pray ? 1.23 : 1;
    const effStr = Math.floor(pot(lv.Strength) * pS) + 3 + 8;
    const effAtk = Math.floor(pot(lv.Attack) * pA) + 0 + 8;
    let best = null;
    for (let t = 0; t < 3; t++) {
      if (w && w.o[t] <= 0 && Math.max(w.o[0], w.o[1], w.o[2]) > 0) continue;
      let ea = effAtk;
      let es = effStr;
      if (voidOf(/^Void melee helm/i)) { ea = Math.floor(ea * 1.1); es = Math.floor(es * 1.1); }
      let mh = Math.floor((es * (b[0] + 64) + 320) / 640);
      let ar = ea * (o[t] + 64);
      const g = gearMult('melee');
      ar = Math.floor(ar * g);
      mh = Math.floor(mh * g);
      const wn = w?.n || '';
      if (dragon && /^Dragon hunter lance/i.test(wn)) { ar = Math.floor(ar * 1.2); mh = Math.floor(mh * 1.2); }
      if (demon && /^(Arclight|Emberlight)/i.test(wn)) { ar = Math.floor(ar * 1.7); mh = Math.floor(mh * 1.7); }
      const dr = (monster.def + 9) * (monster.d[t] + 64);
      const acc = hitChance(ar, dr);
      const dps = (acc * mh) / 2 / (speed * 0.6);
      if (!best || dps > best.dps) best = { dps, mh, ar, dr, acc, t };
    }
    maxHit = best.mh; atkRoll = best.ar; defRoll = best.dr; typeName = T[best.t];
    if (voidOf(/^Void melee helm/i)) notes.push('Void');
  } else if (style === 'ranged') {
    const pot = boosts.pot ? (x) => x + 4 + Math.floor(x * 0.1) : (x) => x;
    const pA = boosts.pray ? 1.2 : 1;
    const pS = boosts.pray ? 1.23 : 1;
    const wn = w?.n || '';
    const cat = w?.c || '';
    let ea = Math.floor(pot(lv.Ranged) * pA) + 8;
    let es = Math.floor(pot(lv.Ranged) * pS) + 8;
    if (voidOf(/^Void ranger helm/i)) {
      ea = Math.floor(ea * 1.1);
      es = Math.floor(es * (elite ? 1.125 : 1.1));
      notes.push(elite ? 'Elite void' : 'Void');
    }
    // Werpwapens (en blowpipe-darts zitten al in het wapen): ammo telt niet mee
    let rstr = b[1];
    let ratk = o[4];
    if (cat === 'Thrown' && gear.ammo) { rstr -= gear.ammo.b[1]; ratk -= gear.ammo.o[4]; }
    let mh = Math.floor(0.5 + (es * (rstr + 64)) / 640);
    let ar = ea * (ratk + 64);
    const g = gearMult('ranged');
    ar = Math.floor(ar * g);
    mh = Math.floor(mh * g);
    if (dragon && /^Dragon hunter crossbow/i.test(wn)) { ar = Math.floor(ar * 1.3); mh = Math.floor(mh * 1.25); notes.push('Dragonbane'); }
    if (/^Twisted bow/i.test(wn)) {
      const M = Math.min(250, monster.mag);
      const accB = Math.min(140, 140 + (3 * M - 10) / 100 - ((3 * M) / 10 - 100) ** 2 / 100) / 100;
      const dmgB = Math.min(250, 250 + (3 * M - 14) / 100 - ((3 * M) / 10 - 140) ** 2 / 100) / 100;
      ar = Math.floor(ar * accB);
      mh = Math.floor(mh * dmgB);
      notes.push('Twisted bow');
    }
    if (/^(Bow of faerdhinen|Crystal bow)/i.test(wn)) {
      let a = 0; let d = 0;
      if (/^Crystal helm/i.test(helm)) { a += 0.05; d += 0.025; }
      if (/^Crystal body/i.test(nm(gear, 'body'))) { a += 0.15; d += 0.075; }
      if (/^Crystal legs/i.test(nm(gear, 'legs'))) { a += 0.1; d += 0.05; }
      if (a) { ar = Math.floor(ar * (1 + a)); mh = Math.floor(mh * (1 + d)); notes.push('Crystal-set'); }
    }
    const kind = cat === 'Crossbow' || cat === 'Chinchompas' ? 6 : cat === 'Thrown' ? 4 : 5;
    defRoll = (monster.def + 9) * (monster.d[kind] + 64);
    atkRoll = ar; maxHit = mh;
    speed = Math.max(1, (w?.sp || 5) - 1); // rapid
    typeName = kind === 6 ? 'heavy' : kind === 4 ? 'light' : 'standard';
  } else {
    const potAdd = boosts.pot ? (x) => x + 1 + Math.floor(x * 0.1) : (x) => x;
    const pA = boosts.pray ? 1.25 : 1;
    const mag = potAdd(lv.Magic);
    let ea = Math.floor(mag * pA) + 9;
    if (voidOf(/^Void mage helm/i)) { ea = Math.floor(ea * 1.45); notes.push('Void'); }
    const wn = w?.n || '';
    let mBonus = b[2] / 1000; // tienden van procenten
    let mAtk = o[3];
    let base;
    if (w?.c === 'Powered Staff') {
      base = Math.max(1, poweredMax(wn, mag));
      speed = 4;
      if (/^Tumeken's shadow/i.test(wn)) {
        mBonus = mBonus * 3; mAtk = (mAtk - w.o[3]) * 3 + w.o[3];
        notes.push('Shadow');
      }
      typeName = 'powered staff';
    } else {
      const book = boosts.spellbook === 'ancient' ? ANCIENT : STANDARD;
      const sp = book.find((x) => x[2] <= mag) || book[book.length - 1];
      base = sp[1];
      speed = 5;
      typeName = sp[0];
      if (sp[0].startsWith('Fire') && /Tome of fire/i.test(nm(gear, 'shield'))) { base = Math.floor(base * 1.1); notes.push('Tome of fire'); }
    }
    if (boosts.pray) mBonus += 0.04; // Augury
    let mh = Math.floor(base * (1 + mBonus));
    let ar = ea * (mAtk + 64);
    const g = gearMult('magic');
    ar = Math.floor(ar * g);
    mh = Math.floor(mh * g);
    atkRoll = ar; maxHit = mh;
    defRoll = (monster.mag + 9) * (monster.d[3] + 64);
  }

  const acc = hitChance(atkRoll, defRoll);
  const perHit = (acc * maxHit) / 2;
  const dps = perHit / (speed * 0.6);
  return { dps, maxHit, acc, speed, atkRoll, defRoll, typeName, notes: [...new Set(notes)], ttk: dps > 0 ? monster.hp / dps : Infinity };
}

// Gear voor een stijl ophalen uit de opgeslagen ids; 2H-wapen = geen schild
export function gearOf(setup, byId) {
  const g = {};
  for (const s of SLOTS) if (setup?.[s] != null && byId.get(setup[s])) g[s] = byId.get(setup[s]);
  if (g.weapon?.h) delete g.shield;
  return g;
}

export function swap(gear, slot, item) {
  const g = { ...gear, [slot]: item };
  if (slot === 'weapon' && item.h) delete g.shield;
  if (slot === 'shield' && g.weapon?.h) delete g.weapon;
  return g;
}

// Welke items horen bij een stijl (grove filter om onzin-kandidaten weg te laten)
export function fitsStyle(style, it) {
  const [st, sl, cr, mg, rg] = it.o;
  const [str, rstr, mstr] = it.b;
  if (it.s === 'weapon') {
    if (style === 'melee') return Math.max(st, sl, cr) > 0 && !['Bow', 'Crossbow', 'Thrown', 'Chinchompas', 'Powered Staff', 'Staff'].includes(it.c);
    if (style === 'ranged') return ['Bow', 'Crossbow', 'Thrown', 'Chinchompas'].includes(it.c);
    return ['Powered Staff', 'Staff', 'Bladed Staff', 'Powered Book'].includes(it.c) && mg > 0;
  }
  if (it.s === 'ammo') return style === 'ranged' ? rstr > 0 : false;
  if (style === 'melee') return str > 0 || Math.max(st, sl, cr) > 0;
  if (style === 'ranged') return rstr > 0 || rg > 0;
  return mstr > 0 || mg > 0;
}
