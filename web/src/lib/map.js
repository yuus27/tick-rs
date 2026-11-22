import { getJSON } from './api.js';

// Kaarttegels en kaartenlijst komen van maps.runescape.wiki (Weird Gloop), via de eigen server.
export const mapMeta = (game) => getJSON(`/api/${game}/map`, 6 * 3600e3);
export const questStarts = (game) => getJSON(`/api/${game}/queststarts`, 6 * 3600e3);

// Hoofdkaart per spel: OSRS "Gielinor Surface" (0), RS3 "RuneScape Surface" (28)
export const SURFACE = { osrs: 0, rs3: 28 };

export function mapHref({ x, y, plane = 0, mapId = -1, zoom, label }) {
  const q = { x, y, p: plane, m: mapId, z: zoom, t: label };
  return '#/map?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== '' && !Number.isNaN(v))).toString();
}

const inBounds = (b, x, y) => Array.isArray(b) && x >= b[0][0] && x <= b[1][0] && y >= b[0][1] && y <= b[1][1];
const area = (b) => (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);

// mapID -1 is de hele wereld (OSRS "Full Map", RS3 "Default"): daar staan oppervlakte en kerkers op hun echte coördinaten.
export const WORLD = -1;
export function resolveMapId(game, meta, mapId, x, y) {
  const bm = meta?.basemaps || [];
  const id = Number(mapId);
  if (Number.isFinite(id) && bm.some((b) => b.mapId === id)) return id;
  if (bm.some((b) => b.mapId === WORLD)) return WORLD;
  const surf = bm.find((b) => b.mapId === SURFACE[game]);
  if (surf && inBounds(surf.bounds, x, y)) return surf.mapId;
  const hit = bm.filter((b) => inBounds(b.bounds, x, y)).sort((a, b) => area(a.bounds) - area(b.bounds))[0];
  return hit ? hit.mapId : SURFACE[game];
}

// Staat een punt (met eigen mapID) op de kaart die nu open is? Oppervlakte en "hele wereld" delen hun coördinaten.
export function onSameMap(game, meta, pt, current) {
  const r = resolveMapId(game, meta, pt.mapId, pt.x, pt.y);
  if (r === current) return true;
  const surf = SURFACE[game];
  if (current === WORLD && r === surf) return true;
  if (current === surf && r === WORLD) return inBounds(meta?.basemaps?.find((b) => b.mapId === surf)?.bounds, pt.x, pt.y);
  return false;
}

export const mapName = (b) => (!b ? '' : b.mapId === WORLD ? 'Hele wereld' : b.name || `Kaart ${b.mapId}`);

export function tileUrl(meta, layer, { mapId, plane, x, y, z }) {
  const tpl = layer === 'icons' ? meta.iconTiles : meta.tiles;
  return tpl.replace('{mapId}', mapId).replace('{z}', z).replace('{p}', plane).replace('{x}', x).replace('{y}', y);
}
