import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { mapMeta, questStarts, resolveMapId, onSameMap, mapName, SURFACE, WORLD, tileUrl, mapHref } from '../lib/map.js';
import { questStatus } from '../lib/wiki.js';
import { Icon, PageHead, ErrorBox, Skel, Toggle } from '../components/ui.jsx';
import { navigate } from '../lib/router.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// Een tegel-laag die de URL-opbouw van maps.runescape.wiki volgt.
// Leaflet (CRS.Simple) telt y omlaag; de wiki telt y omhoog: bestand-y = -y - 1.
const WikiTiles = L.TileLayer.extend({
  getTileUrl(c) {
    const o = this.options;
    return tileUrl(o.meta, o.layer, { mapId: o.mapId, plane: o.plane, x: c.x, y: -c.y - 1, z: c.z });
  },
});

const STATUS = {
  done: { label: 'Voltooid', color: '#4ADE9A' },
  started: { label: 'Bezig', color: '#6CB4FF' },
  none: { label: 'Nog niet gestart', color: null }, // accentkleur van het spel
};

export default function MapView({ query }) {
  const { game, cfg, questMap } = useApp();
  const meta = useAsync(() => mapMeta(game), [game]);
  const starts = useAsync(() => questStarts(game), [game]);

  const qx = Number(query.x), qy = Number(query.y);
  const target = Number.isFinite(qx) && Number.isFinite(qy) ? { x: qx, y: qy, plane: Number(query.p) || 0, mapId: query.m != null ? Number(query.m) : -1, zoom: query.z != null ? Number(query.z) : null, label: query.t || '' } : null;

  const [mapId, setMapId] = useState(null);
  const [plane, setPlane] = useState(0);
  const [showQuests, setShowQuests] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [pos, setPos] = useState(null);
  const [mapQ, setMapQ] = useState('');
  const [questQ, setQuestQ] = useState('');
  const [pickOpen, setPickOpen] = useState(false);

  const el = useRef(null);
  const mapRef = useRef(null);
  const tilesRef = useRef([]);
  const questLayer = useRef(null);
  const targetLayer = useRef(null);

  const basemaps = meta.data?.basemaps || [];
  const current = basemaps.find((b) => b.mapId === mapId);

  // Startkaart: het doel uit de link, anders de oppervlakte
  useEffect(() => {
    if (!meta.data) return;
    if (target) {
      setMapId(resolveMapId(game, meta.data, target.mapId, target.x, target.y));
      setPlane(target.plane);
    } else if (mapId == null || !basemaps.some((b) => b.mapId === mapId)) {
      setMapId(basemaps.some((b) => b.mapId === WORLD) ? WORLD : SURFACE[game]);
      setPlane(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.data, game, query.x, query.y, query.p, query.m]);

  // Leaflet één keer opzetten
  useEffect(() => {
    if (!el.current || mapRef.current || !meta.data) return;
    const m = L.map(el.current, {
      crs: L.CRS.Simple,
      minZoom: meta.data.zoom.min,
      maxZoom: meta.data.zoom.max + 2,
      zoomSnap: 1,
      zoomControl: false,
      attributionControl: true,
    });
    m.attributionControl.setPrefix(false);
    m.setView([3218, 3222], 0, { animate: false });
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.on('mousemove', (e) => setPos({ x: Math.floor(e.latlng.lng), y: Math.floor(e.latlng.lat) }));
    m.on('mouseout', () => setPos(null));
    questLayer.current = L.layerGroup().addTo(m);
    targetLayer.current = L.layerGroup().addTo(m);
    m.getContainer().addEventListener('click', (e) => {
      const a = e.target.closest?.('a[data-nav]');
      if (a) { e.preventDefault(); navigate(a.getAttribute('data-nav')); }
    });
    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; };
  }, [meta.data]);

  // Tegels wisselen bij kaart of verdieping
  useEffect(() => {
    const m = mapRef.current;
    if (!m || mapId == null || !meta.data) return;
    tilesRef.current.forEach((t) => t.remove());
    const common = {
      meta: meta.data, mapId, plane,
      tileSize: 256, noWrap: true,
      minZoom: meta.data.zoom.min, maxZoom: meta.data.zoom.max + 2,
      minNativeZoom: meta.data.zoom.min, maxNativeZoom: meta.data.zoom.max,
      errorTileUrl: BLANK, keepBuffer: 4, updateWhenZooming: false,
    };
    const layers = [new WikiTiles('', { ...common, layer: 'map', attribution: 'Kaart © <a href="https://runescape.wiki" target="_blank" rel="noopener noreferrer">RuneScape Wiki</a> / Weird Gloop · Jagex' })];
    if (meta.data.iconTiles) layers.push(new WikiTiles('', { ...common, layer: 'icons' }));
    layers.forEach((t) => t.addTo(m));
    tilesRef.current = layers;
    const bm = basemaps.find((b) => b.mapId === mapId);
    if (bm?.bounds) {
      const b = L.latLngBounds([bm.bounds[0][1], bm.bounds[0][0]], [bm.bounds[1][1], bm.bounds[1][0]]);
      m.setMaxBounds(b.pad(0.25));
      const tgtHere = target && onSameMap(game, meta.data, target, mapId);
      if (tgtHere) m.setView([target.y + 0.5, target.x + 0.5], target.zoom ?? 2, { animate: false });
      else if (bm.mapId === WORLD || bm.mapId === SURFACE[game]) m.setView(game === 'osrs' ? [3218, 3222] : [3218, 3222], 0, { animate: false });
      else if (bm.center) m.setView([bm.center[1], bm.center[0]], 1, { animate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, plane, meta.data]);

  // Doel-pin uit de link
  useEffect(() => {
    const lg = targetLayer.current;
    if (!lg) return;
    lg.clearLayers();
    if (!target || !meta.data || !onSameMap(game, meta.data, target, mapId)) return;
    const icon = L.divIcon({ className: 'tk-pin', html: '<i></i><b></b>', iconSize: [28, 38], iconAnchor: [14, 36] });
    const mk = L.marker([target.y + 0.5, target.x + 0.5], { icon, keyboard: false }).addTo(lg);
    mk.bindPopup(`<div class="tk-pop"><b>${esc(target.label || 'Locatie')}</b><span>${target.x}, ${target.y}${target.plane ? ` · verdieping ${target.plane}` : ''}</span></div>`, { closeButton: false });
    if (target.label) setTimeout(() => mk.openPopup(), 300);
  }, [mapId, plane, meta.data, query.x, query.y, query.t]);

  // Quest-startpunten met je eigen voortgang
  const questPts = useMemo(() => {
    if (!meta.data || !starts.data) return [];
    return starts.data.quests.map((q) => ({ ...q, st: questStatus(questMap, q.title) || 'none' }));
  }, [starts.data, meta.data, questMap, game]);
  const here = useMemo(() => questPts.filter((q) => meta.data && mapId != null && onSameMap(game, meta.data, q, mapId)), [questPts, mapId, meta.data, game]);

  useEffect(() => {
    const lg = questLayer.current;
    if (!lg) return;
    lg.clearLayers();
    if (!showQuests) return;
    for (const q of here) {
      if (!showDone && q.st === 'done') continue;
      const s = STATUS[q.st] || STATUS.none;
      const other = q.plane !== plane;
      const mk = L.circleMarker([q.y + 0.5, q.x + 0.5], {
        radius: 6, weight: 2, color: '#0B0D11', fillColor: s.color || cfg.accent, fillOpacity: other ? 0.35 : 0.95, opacity: other ? 0.5 : 1,
      }).addTo(lg);
      mk.bindTooltip(esc(q.title), { direction: 'top', offset: [0, -6], className: 'tk-tip' });
      mk.bindPopup(`<div class="tk-pop"><b>${esc(q.title)}</b><em style="color:${s.color || cfg.accent}">${s.label}${q.plane ? ` · verdieping ${q.plane}` : ''}</em>${q.start ? `<span>${esc(q.start)}</span>` : ''}<a href="#" data-nav="${esc('#/quests/' + encodeURIComponent(q.title))}">Quest-gids openen →</a></div>`, { closeButton: false, maxWidth: 280 });
    }
  }, [here, plane, showQuests, showDone, cfg.accent]);

  const onMap = here;
  const counts = { none: 0, started: 0, done: 0 };
  onMap.forEach((q) => { counts[q.st] = (counts[q.st] || 0) + 1; });

  const pickList = useMemo(() => {
    const q = mapQ.trim().toLowerCase();
    const list = basemaps.filter((b) => !q || mapName(b).toLowerCase().includes(q));
    const rank = (b) => (b.mapId === WORLD ? 0 : b.mapId === SURFACE[game] ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || mapName(a).localeCompare(mapName(b))).slice(0, 80);
  }, [basemaps, mapQ, game]);

  const questHits = useMemo(() => {
    const q = questQ.trim().toLowerCase();
    if (q.length < 2) return [];
    return questPts.filter((x) => x.title.toLowerCase().includes(q)).slice(0, 8);
  }, [questPts, questQ]);

  const goQuest = (q) => {
    setQuestQ('');
    navigate(mapHref({ x: q.x, y: q.y, plane: q.plane, mapId: q.mapId, zoom: 2, label: q.title }));
  };

  const copy = () => {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    navigator.clipboard?.writeText(`${Math.floor(c.lng)},${Math.floor(c.lat)},${plane}`);
  };

  return (
    <div className="page">
      <PageHead
        eyebrow={<><Icon name="map" size={14} /><span>{cfg.short} · tegels van de wiki, altijd de nieuwste versie</span></>}
        title="Wereldkaart"
        sub="Klik op een quest voor het startpunt en de gids. Elke “Show on map”-link in tick. opent hier."
        right={target && <a className="btn sm" href="#/map"><Icon name="x" size={13} /> Pin weghalen</a>}
      />
      {meta.error && <div className="card"><ErrorBox error={meta.error} onRetry={meta.reload} /></div>}
      <div className="tk-mapwrap rise">
        {!meta.data && !meta.error && <Skel h="100%" r={18} />}
        <div ref={el} className="tk-map" />
        {meta.data && (
          <>
            <div className="tk-mapctl col">
              <div className="tk-mapbox col" style={{ gap: 8 }}>
                <button className="tk-mappick row between" onClick={() => setPickOpen((v) => !v)} aria-expanded={pickOpen}>
                  <span className="col" style={{ gap: 0, minWidth: 0 }}><span className="small dim">Kaart</span><b className="ellipsis">{mapName(current) || '…'}</b></span>
                  <Icon name={pickOpen ? 'x' : 'search'} size={15} />
                </button>
                {pickOpen && (
                  <div className="col" style={{ gap: 6 }}>
                    <input className="input" style={{ height: 36 }} autoFocus placeholder={`Zoek in ${basemaps.length} kaarten…`} value={mapQ} onChange={(e) => setMapQ(e.target.value)} />
                    <div className="tk-maplist col">
                      {pickList.map((b) => <button key={b.mapId} className={b.mapId === mapId ? 'on' : ''} onClick={() => { setMapId(b.mapId); setPlane(0); setPickOpen(false); setMapQ(''); if (target) navigate('#/map'); }}>{mapName(b)}</button>)}
                      {!pickList.length && <span className="small dim" style={{ padding: 8 }}>Niets gevonden.</span>}
                    </div>
                  </div>
                )}
                <div className="row between" style={{ gap: 8 }}>
                  <span className="small dim">Verdieping</span>
                  <div className="seg">{[0, 1, 2, 3].map((p) => <button key={p} className={plane === p ? 'on' : ''} onClick={() => setPlane(p)}>{p}</button>)}</div>
                </div>
              </div>
              <div className="tk-mapbox col" style={{ gap: 8 }}>
                <div className="row between small"><span>Quest-startpunten</span><Toggle on={showQuests} onChange={setShowQuests} label="Quest-startpunten" /></div>
                <div className="row between small"><span>Ook voltooide quests</span><Toggle on={showDone} onChange={setShowDone} label="Ook voltooide quests" /></div>
                {starts.loading && <span className="small dim">Startpunten laden…</span>}
                {starts.error && <span className="small down">Startpunten niet geladen.</span>}
                {showQuests && starts.data && (
                  <div className="col" style={{ gap: 4 }}>
                    {Object.entries(STATUS).filter(([k]) => showDone || k !== 'done').map(([k, s]) => (
                      <span key={k} className="row small" style={{ gap: 8 }}><i className="tk-dot" style={{ background: s.color || cfg.accent }} />{s.label}<span className="dim mono" style={{ marginLeft: 'auto' }}>{counts[k] || 0}</span></span>
                    ))}
                    <span className="small dim">{onMap.length} van {starts.data.quests.length} quests op deze kaart</span>
                  </div>
                )}
                <div className="col" style={{ gap: 4, position: 'relative' }}>
                  <input className="input" style={{ height: 36 }} placeholder="Quest zoeken…" value={questQ} onChange={(e) => setQuestQ(e.target.value)} />
                  {!!questHits.length && (
                    <div className="tk-maplist col">
                      {questHits.map((q) => <button key={q.title} onClick={() => goQuest(q)}>{q.title}</button>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="tk-mapcoord mono small">
              {pos ? <>x {pos.x} · y {pos.y} · p {plane}</> : <span className="dim">beweeg over de kaart</span>}
              <button className="btn ghost sm" onClick={copy} title="Coördinaat van het midden kopiëren"><Icon name="plus" size={12} /> Kopieer midden</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
