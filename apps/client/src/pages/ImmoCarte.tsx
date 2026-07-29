import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useCompany, useModulePerms } from '@/lib/useCompany';
import { fmtMoney } from '@/lib/declarations';
import {
  getParcels, createParcel, updateParcel, deleteParcel,
  type Parcel, type ParcelGeometry, type ParcelStatus,
} from '@/lib/immo';

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring';
const labelCls = 'mb-1 block text-xs font-medium text-muted-foreground';
const STATUS_COLOR: Record<ParcelStatus, string> = { disponible: '#22c55e', vendu: '#ef4444', active: '#f59e0b' };
const STATUS_LABEL: Record<ParcelStatus, string> = { disponible: 'Disponible', vendu: 'Vendu', active: 'Loué (actif)' };
const EXTRA_ZOOM = 3; // niveaux de zoom digital au-delà du natif (plus profond que le NPU)

interface MapMeta { w: number; h: number; maxZoom: number; hasTiles: boolean }

async function fetchMeta(): Promise<MapMeta> {
  try {
    const r = await fetch('/immo-tiles/meta.json', { cache: 'no-cache' });
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
      const j = await r.json();
      if (j?.w && j?.h) return { w: j.w, h: j.h, maxZoom: j.maxZoom ?? Math.ceil(Math.log2(Math.max(j.w, j.h) / 256)), hasTiles: true };
    }
  } catch { /* pas de tuiles */ }
  return { w: 2048, h: 2048, maxZoom: 3, hasTiles: false };
}

const toNorm = (map: L.Map, m: MapMeta, ll: L.LatLng): [number, number] => {
  const p = map.project(ll, m.maxZoom);
  return [p.x / m.w, p.y / m.h];
};
const fromNorm = (map: L.Map, m: MapMeta, nx: number, ny: number): L.LatLng =>
  map.unproject([nx * m.w, ny * m.h], m.maxZoom);

function geometryFromLayer(map: L.Map, m: MapMeta, layer: L.Layer): ParcelGeometry | null {
  if (layer instanceof L.Marker) return { type: 'marker', coords: [toNorm(map, m, layer.getLatLng())] };
  if (layer instanceof L.Polygon) {
    const lls = layer.getLatLngs()[0] as L.LatLng[];
    return { type: 'polygon', coords: lls.map((ll) => toNorm(map, m, ll)) };
  }
  return null;
}

export default function ImmoCarte() {
  const { companyId, canCreate, canEdit, canDelete } = useModulePerms('immo_carte');
  const { slug } = useCompany();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusRef = searchParams.get('focus');
  const canWrite = canCreate || canEdit;
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const openFicheFor = (link: NonNullable<Parcel['link']>, ref: string) =>
    navigate(`/entreprise/${slug}/m/immobilier?ref=${encodeURIComponent(ref)}&tab=${link.kind}`);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.FeatureGroup | null>(null);
  const metaRef = useRef<MapMeta | null>(null);
  const [ready, setReady] = useState(false);

  const metaQ = useQuery({ queryKey: ['immo-tiles-meta'], queryFn: fetchMeta, staleTime: Infinity });
  const q = useQuery({ queryKey: ['immo-parcels', companyId], queryFn: () => getParcels(companyId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['immo-parcels', companyId] });

  const [pending, setPending] = useState<ParcelGeometry | null>(null);
  const [editParcel, setEditParcel] = useState<Parcel | null>(null);

  const create = useMutation({
    mutationFn: (v: { geometry: ParcelGeometry; ref: string; status: ParcelStatus; price: number; owner: string; notes: string }) =>
      createParcel(companyId, { propertyRef: v.ref, status: v.status, price: v.price, ownerName: v.owner || null, notes: v.notes || null, geometry: v.geometry }),
    onSuccess: () => { setPending(null); invalidate(); },
    onError: () => toast('Échec de la création.', 'error'),
  });
  const update = useMutation({
    mutationFn: (v: { id: number; ref: string; status: ParcelStatus; price: number; owner: string; notes: string }) =>
      updateParcel(companyId, v.id, { propertyRef: v.ref, status: v.status, price: v.price, ownerName: v.owner || null, notes: v.notes || null }),
    onSuccess: () => { setEditParcel(null); invalidate(); },
    onError: () => toast('Échec.', 'error'),
  });
  const updateGeom = useMutation({
    mutationFn: (v: { id: number; geometry: ParcelGeometry }) => updateParcel(companyId, v.id, { geometry: v.geometry }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: number) => deleteParcel(companyId, id), onSuccess: invalidate, onError: () => toast('Échec.', 'error') });

  // init map once meta chargée
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !metaQ.data) return;
    const meta = metaQ.data;
    metaRef.current = meta;
    if (!document.getElementById('immo-label-style')) {
      const st = document.createElement('style');
      st.id = 'immo-label-style';
      st.textContent = '.leaflet-tooltip.immo-label{background:transparent;border:0;box-shadow:none;color:#fff;font-weight:700;font-size:12px;text-shadow:0 0 3px #000,0 0 3px #000,0 0 3px #000;padding:0;}';
      document.head.appendChild(st);
    }
    const mz = meta.maxZoom;
    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple, minZoom: 0, maxZoom: mz + EXTRA_ZOOM,
      zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 80,
      attributionControl: false, zoomControl: true,
    });
    const bounds = L.latLngBounds(map.unproject([0, meta.h], mz), map.unproject([meta.w, 0], mz));
    map.fitBounds(bounds);
    map.setMaxBounds(bounds.pad(0.2));
    if (meta.hasTiles) {
      L.tileLayer(`/immo-tiles/{z}/{x}/{y}.png?v=${meta.w}_${meta.h}_${mz}`, { tileSize: 256, minZoom: 0, maxNativeZoom: mz, maxZoom: mz + EXTRA_ZOOM, noWrap: true, bounds }).addTo(map);
    }
    const layer = new L.FeatureGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;

    if (canWrite) {
      map.pm.addControls({ position: 'topleft', drawMarker: true, drawPolygon: true, drawRectangle: true, drawPolyline: false, drawCircle: false, drawCircleMarker: false, drawText: false, editMode: true, dragMode: true, cutPolygon: false, removalMode: false, rotateMode: false });
      map.pm.setLang('fr');
      map.on('pm:create', (e: { layer: L.Layer }) => {
        const geom = geometryFromLayer(map, meta, e.layer);
        map.removeLayer(e.layer);
        if (geom) setPending(geom);
      });
    }
    setReady(true);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, [metaQ.data, canWrite]);

  // (re)dessin des parcelles
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const meta = metaRef.current;
    if (!map || !layer || !meta || !ready) return;
    layer.clearLayers();
    const shapesByRef = new Map<string, L.Layer>();
    for (const p of q.data?.parcels ?? []) {
      const color = STATUS_COLOR[p.status];
      let shape: L.Layer;
      if (p.geometry.type === 'marker') {
        const pt = p.geometry.coords[0];
        if (!pt) continue;
        shape = L.circleMarker(fromNorm(map, meta, pt[0], pt[1]), { radius: 9, color, fillColor: color, fillOpacity: 0.85, weight: 2 });
      } else {
        shape = L.polygon(p.geometry.coords.map(([nx, ny]) => fromNorm(map, meta, nx, ny)), { color, fillColor: color, fillOpacity: 0.35, weight: 2 });
      }
      shape.bindTooltip(p.propertyRef, { permanent: true, direction: 'center', className: 'immo-label', opacity: 1 });
      shape.bindPopup(popupHtml(p), { minWidth: 200 });
      shapesByRef.set(p.propertyRef, shape);
      shape.on('popupopen', (ev: L.PopupEvent) => {
        const root = ev.popup.getElement();
        if (!root) return;
        root.querySelector('[data-fiche]')?.addEventListener('click', () => { if (p.link) openFicheFor(p.link, p.propertyRef); });
        root.querySelector('[data-edit]')?.addEventListener('click', () => { setEditParcel(p); shape.closePopup(); });
        root.querySelector('[data-del]')?.addEventListener('click', async () => {
          shape.closePopup();
          if (await confirm({ title: 'Supprimer cette parcelle ?', message: p.propertyRef, destructive: true })) remove.mutate(p.id);
        });
      });
      if (canEdit) shape.on('pm:edit', () => { const g = geometryFromLayer(map, meta, shape); if (g) updateGeom.mutate({ id: p.id, geometry: g }); });
      layer.addLayer(shape);
    }
    if (focusRef) {
      const target = shapesByRef.get(focusRef);
      if (target) {
        const b = 'getBounds' in target ? (target as L.Polygon).getBounds() : undefined;
        if (b && b.isValid()) map.fitBounds(b.pad(3), { maxZoom: meta.maxZoom });
        else if ('getLatLng' in target) map.setView((target as L.CircleMarker).getLatLng(), meta.maxZoom);
        target.openPopup();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, ready, canEdit, focusRef]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Immobilier</p>
          <h1 className="text-xl font-bold">Carte interactive</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Legend color={STATUS_COLOR.disponible} label="Disponible" />
          <Legend color={STATUS_COLOR.vendu} label="Vendu" />
          <Legend color={STATUS_COLOR.active} label="Loué" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div ref={containerRef} className="h-[74vh] w-full bg-[#0f172a] [&_.leaflet-container]:bg-[#0f172a]" />
      </div>

      <p className="text-xs text-muted-foreground">
        {metaQ.data && !metaQ.data.hasTiles
          ? 'Aucune carte tuilée détectée. Lance scripts/tile-immo-map.py sur ton image pour générer les tuiles /immo-tiles.'
          : canWrite
            ? 'Molette pour zoomer (net jusqu’au zoom natif, puis zoom digital). Outils à gauche pour dessiner une parcelle ; tape son numéro (celui de la résidence en jeu). Clique une parcelle pour l’éditer.'
            : 'Molette pour zoomer. Clique une parcelle pour voir ses détails.'}
      </p>

      {pending && <ParcelModal title="Nouvelle parcelle" pending onClose={() => setPending(null)} onSave={(v) => create.mutate({ ...v, geometry: pending })} saving={create.isPending} />}
      {editParcel && <ParcelModal title={`Modifier — ${editParcel.propertyRef}`} initial={editParcel} onClose={() => setEditParcel(null)} onSave={(v) => update.mutate({ id: editParcel.id, ...v })} saving={update.isPending} canDelete={canDelete} onDelete={async () => { if (await confirm({ title: 'Supprimer cette parcelle ?', message: editParcel.propertyRef, destructive: true })) { remove.mutate(editParcel.id); setEditParcel(null); } }} />}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: color }} />{label}</span>;
}

function popupHtml(p: Parcel): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return `<div style="min-width:190px;font-family:inherit">
    <div style="font-weight:700;margin-bottom:4px">${esc(p.propertyRef)}</div>
    <div style="font-size:12px;color:#64748b">Statut : <b style="color:${STATUS_COLOR[p.status]}">${STATUS_LABEL[p.status]}</b></div>
    <div style="font-size:12px;color:#64748b">Propriétaire : ${esc(p.ownerName ?? '—')}</div>
    <div style="font-size:12px;color:#64748b;margin-bottom:8px">Prix : ${fmtMoney(p.price)} $</div>
    ${p.link ? `<button data-fiche style="cursor:pointer;border:0;border-radius:6px;padding:4px 10px;margin-bottom:6px;width:100%;background:#0ea5e9;color:#fff;font-size:12px">Voir la fiche ${p.link.kind === 'location' ? 'location' : 'vente'} →</button>` : ''}
    <button data-edit style="cursor:pointer;border:0;border-radius:6px;padding:4px 10px;margin-right:6px;background:#6366f1;color:#fff;font-size:12px">Modifier</button>
    <button data-del style="cursor:pointer;border:0;border-radius:6px;padding:4px 10px;background:#ef4444;color:#fff;font-size:12px">Supprimer</button>
  </div>`;
}

function ParcelModal({ title, initial, pending, canDelete, onClose, onSave, onDelete, saving }: {
  title: string; initial?: Parcel; pending?: boolean; canDelete?: boolean;
  onClose: () => void; onSave: (v: { ref: string; status: ParcelStatus; price: number; owner: string; notes: string }) => void; onDelete?: () => void; saving: boolean;
}) {
  const [ref, setRef] = useState(initial?.propertyRef ?? '');
  const [status, setStatus] = useState<ParcelStatus>(initial?.status ?? 'disponible');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [owner, setOwner] = useState(initial?.ownerName ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const valid = ref.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" /> {title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form className="grid grid-cols-2 gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (valid && !saving) onSave({ ref: ref.trim(), status, price: Number(price) || 0, owner: owner.trim(), notes: notes.trim() }); }}>
          <label className="text-sm"><span className={labelCls}>N° / Réf.</span><input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex. 8245" autoFocus /></label>
          <label className="text-sm"><span className={labelCls}>Statut</span><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as ParcelStatus)}>{(Object.keys(STATUS_LABEL) as ParcelStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}</select></label>
          <label className="text-sm"><span className={labelCls}>Prix ($)</span><input type="number" min="0" step="1" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="250000" /></label>
          <label className="text-sm"><span className={labelCls}>Propriétaire</span><input className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Nom" /></label>
          <label className="col-span-2 text-sm"><span className={labelCls}>Notes</span><textarea className={`${inputCls} h-16 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <div className="col-span-2 flex justify-between gap-2 pt-1">
            {initial && canDelete && onDelete ? <Button type="button" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={onDelete}>Supprimer</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
              <Button type="submit" disabled={!valid || saving}>{saving ? 'Enregistrement…' : pending ? 'Créer' : 'Enregistrer'}</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
