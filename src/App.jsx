import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { supabase } from "./lib/supabase";
import cameraIcon from "./assets/camera.svg";
import treeIcon from "./assets/Tree-02.svg";
import markerIcon from "./assets/Tree-01.svg";
import { createRoot } from "react-dom/client";

const HEALTH_OPTIONS = ["Healthy", "Stressed", "Declining", "Dead"];
const AGE_OPTIONS = ["Sapling", "Young", "Mature", "Old", "Unknown"];
const BLD_OPTIONS = ["Yes", "No", "Unsure"];

const DARK_STYLE = {
  version: 8,
  sources: {
    dark: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "dark", type: "raster", source: "dark" }],
};

const OVERLAYS = [
  { key: "bucks_boundary", label: "Bucks County Boundary", url: "/overlays/bucks_boundary.geojson" },
  { key: "state_forests", label: "State Forests", url: "/overlays/state_forests.geojson" },
  { key: "state_parks", label: "State Parks", url: "/overlays/state_parks.geojson" },
  { key: "bucks_parks", label: "Bucks County Parks", url: "/overlays/bucks_parks.geojson" },
];

const TREE_SVGS = ["/patterns/Tree-01.svg", "/patterns/Tree-02.svg", "/patterns/Tree-03.svg"];

function hash2D(x, y) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return Math.abs(n);
}

const LAYER_STYLE = {
  bucks_boundary: { stroke: "rgba(212,245,220,0.95)", fill: "rgba(212,245,220,0.06)", lineWidth: 4 },
  state_forests: { stroke: "rgba(34,197,94,0.95)", fill: "rgba(34,197,94,0.18)", lineWidth: 2 },
  state_parks: { stroke: "rgba(20,184,166,0.95)", fill: "rgba(20,184,166,0.16)", lineWidth: 2 },
  bucks_parks: { stroke: "rgba(234,179,8,0.95)", fill: "rgba(234,179,8,0.14)", lineWidth: 2 },
};

function TreePatternOverlay({ cell = 92, opacity = 0.8, zIndex = 1 }) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  const [interactive, setInteractive] = useState(() => {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const noHover = window.matchMedia?.("(hover: none)")?.matches;
    const touchPoints = navigator?.maxTouchPoints || 0;
    return !(touchPoints > 0 && (coarse || noHover));
  });

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);

    const mqCoarse = window.matchMedia?.("(pointer: coarse)");
    const mqNoHover = window.matchMedia?.("(hover: none)");
    const sync = () => {
      const coarse = mqCoarse?.matches;
      const noHover = mqNoHover?.matches;
      const touchPoints = navigator?.maxTouchPoints || 0;
      setInteractive(!(touchPoints > 0 && (coarse || noHover)));
    };

    mqCoarse?.addEventListener?.("change", sync);
    mqNoHover?.addEventListener?.("change", sync);

    return () => {
      window.removeEventListener("resize", onResize);
      mqCoarse?.removeEventListener?.("change", sync);
      mqNoHover?.removeEventListener?.("change", sync);
    };
  }, []);

  const cols = Math.ceil(size.w / cell);
  const rows = Math.ceil(size.h / cell);

  const glyphRefs = useRef([]);
  const centersRef = useRef([]);
  const rafRef = useRef(null);
  const runningRef = useRef(false);

  const mouseTargetRef = useRef({ x: -9999, y: -9999, active: false });
  const mouseCurrentRef = useRef({ x: -9999, y: -9999 });

  const glyphMeta = useMemo(() => {
    const meta = [];
    for (let i = 0; i < cols * rows; i++) {
      const x = i % cols;
      const y = Math.floor(i / cols);

      const pick = hash2D(x, y) % TREE_SVGS.length;
      const src = TREE_SVGS[pick];

      const r = hash2D(x + 11, y + 37);
      const scale = 0.6 + (r % 60) / 100;
      const dx = ((hash2D(x + 3, y + 5) % 11) - 5) * 1.2;
      const dy = ((hash2D(x + 6, y + 9) % 11) - 5) * 1.2;

      meta.push({ src, scale, dx, dy });
    }

    glyphRefs.current = new Array(meta.length).fill(null);
    centersRef.current = new Array(meta.length).fill(null);

    return meta;
  }, [cols, rows]);

  const measureCenters = () => {
    for (let i = 0; i < glyphRefs.current.length; i++) {
      const el = glyphRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      centersRef.current[i] = { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    }
  };

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        measureCenters();
      });
    });

    window.addEventListener("resize", measureCenters);
    window.addEventListener("scroll", measureCenters, true);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", measureCenters);
      window.removeEventListener("scroll", measureCenters, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glyphMeta]);

  const stopLoop = () => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const startLoop = () => {
    if (runningRef.current) return;
    runningRef.current = true;

    const loop = () => {
      if (!runningRef.current) return;

      const t = mouseTargetRef.current;
      const c = mouseCurrentRef.current;

      const ease = t.active ? 0.22 : 0.18;
      c.x += (t.x - c.x) * ease;
      c.y += (t.y - c.y) * ease;

      const R = 420;
      const maxRot = 38;
      const rotGain = 0.28;
      const maxDepth = 0.32;

      for (let i = 0; i < glyphRefs.current.length; i++) {
        const el = glyphRefs.current[i];
        const center = centersRef.current[i];
        if (!el || !center) continue;

        if (!t.active) {
          el.style.setProperty("--hover-rot", "0deg");
          el.style.setProperty("--hover-scale", "1");
          continue;
        }

        const dx = c.x - center.cx;
        const dy = c.y - center.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > R) {
          el.style.setProperty("--hover-rot", "0deg");
          el.style.setProperty("--hover-scale", "1");
          continue;
        }

        const u = 1 - dist / R;
        const eased = u * u * (3 - 2 * u);

        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const rot = Math.max(-maxRot, Math.min(maxRot, angle * rotGain)) * eased;
        const depth = 1 + maxDepth * eased;

        el.style.setProperty("--hover-rot", `${rot.toFixed(2)}deg`);
        el.style.setProperty("--hover-scale", depth.toFixed(3));
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    if (!interactive) {
      stopLoop();
      return;
    }

    const onMove = (e) => {
      mouseTargetRef.current = { x: e.clientX, y: e.clientY, active: true };
      startLoop();
    };

    const onLeave = () => {
      mouseTargetRef.current.active = false;
      setTimeout(() => {
        if (!mouseTargetRef.current.active) stopLoop();
      }, 220);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      stopLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex,
        opacity,
        mixBlendMode: "exclusion",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
          gridTemplateRows: `repeat(${rows}, ${cell}px)`,
        }}
      >
        {glyphMeta.map((m, i) => (
          <div
            key={i}
            style={{
              width: cell,
              height: cell,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <img
              ref={(node) => (glyphRefs.current[i] = node)}
              src={m.src}
              alt=""
              draggable={false}
              style={{
                width: 38,
                height: 38,
                "--dx": `${m.dx}px`,
                "--dy": `${m.dy}px`,
                "--s": m.scale,
                "--hover-rot": "0deg",
                "--hover-scale": "1",
                transform:
                  "translate(var(--dx), var(--dy)) rotate(var(--hover-rot)) scale(calc(var(--s) * var(--hover-scale)))",
                transformOrigin: "50% 50%",
                transition: "transform 70ms ease-out",
                willChange: "transform",
                opacity: 1.0,
                filter: "grayscale(1) brightness(.9)",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function computeGeoJSONBounds(fc) {
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) return null;

  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;

  const scan = (coords) => {
    if (!coords) return;
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
      return;
    }
    for (const c of coords) scan(c);
  };

  for (const f of fc.features) scan(f?.geometry?.coordinates);

  if (!isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

async function compressImageToJpeg(file, { maxSize = 900, quality = 0.75 } = {}) {
  const img = new Image();
  const url = URL.createObjectURL(file);

  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Image compression failed.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function extractPhotoUrlAndCleanNotes(notes) {
  const text = String(notes || "");
  const match = text.match(/^\s*Photo:\s*(https?:\/\/\S+)\s*$/im);
  const photoUrl = match?.[1] || null;

  const cleaned = text
    .split("\n")
    .filter((line) => !/^\s*Photo:\s*https?:\/\/\S+\s*$/i.test(line))
    .join("\n")
    .trim();

  return { photoUrl, cleanedNotes: cleaned };
}

function makeCircleAvatarDataUrlFromBlob(blob, size = 96) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = reject;
    img.src = url;
  });
}

function SelectedSpecimenPopup({ mapRef, selected, lngLat, onClose, ui }) {
  const popupRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map) return;

    const lng = Number(lngLat?.lng);
    const lat = Number(lngLat?.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    // Clean up previous
    try {
      rootRef.current?.unmount?.();
    } catch {}
    rootRef.current = null;

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    // Create popup DOM
    const el = document.createElement("div");
    el.style.maxWidth = "360px";

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 22,
      maxWidth: "360px",
      className: "specimen-popup",
    })
      .setLngLat([lng, lat])
      .setDOMContent(el)
      .addTo(map);

    popupRef.current = popup;

    const root = createRoot(el);
    rootRef.current = root;

    const { photoUrl, cleanedNotes } = extractPhotoUrlAndCleanNotes(selected?.notes);

    root.render(
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(10,14,22,0.78)",
          color: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
          pointerEvents: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900, lineHeight: 1.1 }}>
            {selected?.specimen_id || "Specimen"}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...ui.button(false),
              padding: "6px 10px",
              borderRadius: 12,
              fontWeight: 900,
              lineHeight: 1,
            }}
            aria-label="Close specimen"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ opacity: 0.85, marginTop: 6, fontSize: 12 }}>
          {(selected?.species || "Unknown")} • {(selected?.health || "Unknown")}
        </div>

        {photoUrl ? (
          <div style={{ marginTop: 10 }}>
            <img
              src={photoUrl}
              alt="Specimen"
              loading="lazy"
              style={{
                width: "100%",
                maxHeight: 180,
                objectFit: "cover",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
                display: "block",
              }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        ) : null}

        <div style={{ opacity: 0.78, marginTop: 10, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {cleanedNotes || "No notes"}
        </div>

        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      </div>
    );

    const sync = () => popup.setLngLat([lng, lat]);
    map.on("move", sync);

    return () => {
      map.off("move", sync);
      try {
        rootRef.current?.unmount?.();
      } catch {}
      rootRef.current = null;

      popup.remove();
      popupRef.current = null;
    };
  }, [mapRef, selected, lngLat, onClose, ui]);

  return null;
}
export default function App() {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const draftMarkerRef = useRef(null);

  const [selectedLngLat, setSelectedLngLat] = useState(null); // { lng, lat }
  const [error, setError] = useState("");
  const [mapStatus, setMapStatus] = useState("Map: initializing…");

  const [specimenList, setSpecimenList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [geojson, setGeojson] = useState({ type: "FeatureCollection", features: [] });

  const [overlayData, setOverlayData] = useState({});
  const [overlayOn, setOverlayOn] = useState(() => {
    const initial = {};
    for (const o of OVERLAYS) initial[o.key] = false;
    initial.bucks_boundary = true;
    initial.state_forests = true;
    return initial;
  });

  function getCoordsForRow(row) {
    const id = row?.specimen_id || row?.specimenId;

    if (id && geojson?.features?.length) {
      const f = geojson.features.find(
        (ff) => ff?.properties?.specimen_id === id || ff?.properties?.specimenId === id
      );
      const c = f?.geometry?.coordinates;
      if (Array.isArray(c) && c.length === 2) return { lng: Number(c[0]), lat: Number(c[1]) };
    }

    const latRaw = row?.lat ?? row?.latitude;
    const lngRaw = row?.lng ?? row?.longitude;

    let lat = Number(latRaw);
    let lng = Number(lngRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const looksSwapped = Math.abs(lat) > 60 && Math.abs(lng) <= 60;
    if (looksSwapped) {
      const tmp = lat;
      lat = lng;
      lng = tmp;
    }

    return { lng, lat };
  }

  function bumpMapResize(times = 2) {
    const map = mapRef.current;
    if (!map) return;

    requestAnimationFrame(() => map.resize());
    if (times > 1) setTimeout(() => map.resize(), 180);
    if (times > 2) setTimeout(() => map.resize(), 420);
  }

  // UI drawers
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  // Form state
  const [specimenId, setSpecimenId] = useState("");
  const [adoptName, setAdoptName] = useState("");
  const [species, setSpecies] = useState("Beech");
  const [health, setHealth] = useState("Healthy");
  const [ageClass, setAgeClass] = useState("Unknown");
  const [bldSigns, setBldSigns] = useState("Unsure");

  const [dbhIn, setDbhIn] = useState("");
  const [notes, setNotes] = useState("");

  const [observedDate, setObservedDate] = useState(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [gpsStatus, setGpsStatus] = useState("");

  const [photoBlob, setPhotoBlob] = useState(null);
  const [photoAvatar, setPhotoAvatar] = useState("");
  const [photoStatus, setPhotoStatus] = useState("");

  const canSubmit = useMemo(() => specimenId.trim().length > 0, [specimenId]);

  function clearDraftMarker() {
    if (draftMarkerRef.current) {
      draftMarkerRef.current.remove();
      draftMarkerRef.current = null;
    }
  }

  function setDraftLocation(latitude, longitude) {
    const latFixed = Number(latitude).toFixed(6);
    const lngFixed = Number(longitude).toFixed(6);

    setLat(latFixed);
    setLng(lngFixed);
    setGpsStatus("Location set.");

    const map = mapRef.current;
    if (!map) return;

    clearDraftMarker();

    const marker = new maplibregl.Marker({ draggable: true })
      .setLngLat([Number(lngFixed), Number(latFixed)])
      .addTo(map);

    marker.on("dragend", () => {
      const ll = marker.getLngLat();
      setLat(ll.lat.toFixed(6));
      setLng(ll.lng.toFixed(6));
      setGpsStatus("Location adjusted (drag marker).");
    });

    draftMarkerRef.current = marker;
  }

  async function loadList() {
    const { data, error } = await supabase
      .from("specimens")
      .select("id, specimen_id, species, health, dbh_in, observed_date, notes, created_at, lat, lng")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    setSpecimenList(data || []);
  }

  async function loadGeoJSON() {
    const { data, error } = await supabase.rpc("specimens_geojson");
    if (error) throw error;

    const fc = data && data.type === "FeatureCollection" ? data : { type: "FeatureCollection", features: [] };
    setGeojson(fc);
    return fc;
  }

  async function refreshAll() {
    setError("");
    try {
      await Promise.all([loadList(), loadGeoJSON()]);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    bumpMapResize(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, addOpen, listOpen]);

  useEffect(() => {
    refreshAll();
  }, []);

  async function handleUseGPS() {
    setGpsStatus("");
    if (!navigator.geolocation) return setGpsStatus("Geolocation not supported.");

    setGpsStatus("Getting GPS…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraftLocation(pos.coords.latitude, pos.coords.longitude);
        setGpsStatus("GPS captured.");
      },
      (err) => setGpsStatus(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function flyToGPS() {
    setGpsStatus("");
    if (!navigator.geolocation) return setGpsStatus("Geolocation not supported.");

    setGpsStatus("Getting GPS…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsStatus("GPS captured.");
        mapRef.current?.easeTo({ center: [longitude, latitude], zoom: 15 });
      },
      (err) => setGpsStatus(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handlePickPhoto(file) {
    setPhotoStatus("");
    setPhotoBlob(null);
    setPhotoAvatar("");

    if (!file) return;

    try {
      setPhotoStatus("Compressing photo…");
      const compressed = await compressImageToJpeg(file, { maxSize: 1200, quality: 0.78 });
      setPhotoBlob(compressed);

      const avatar = await makeCircleAvatarDataUrlFromBlob(compressed, 96);
      setPhotoAvatar(avatar);

      setPhotoStatus("Photo ready.");
    } catch (e) {
      console.error(e);
      setPhotoStatus("Photo failed to process.");
    }
  }

  async function uploadPhotoToSupabaseStorage(specimenIdForFile) {
    if (!photoBlob) return null;

    const bucket = "specimen-photos";
    const filename = `${specimenIdForFile}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filename, photoBlob, { contentType: "image/jpeg", upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
    return data?.publicUrl || null;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");

    const latNum = lat === "" ? null : Number(lat);
    const lngNum = lng === "" ? null : Number(lng);

    try {
      let photoUrl = null;
      if (photoBlob) {
        setPhotoStatus("Uploading photo…");
        photoUrl = await uploadPhotoToSupabaseStorage(specimenId.trim());
        setPhotoStatus(photoUrl ? "Photo uploaded." : "");
      }

      const { error } = await supabase.rpc("create_specimen", {
        p_specimen_id: specimenId.trim(),
        p_species: species.trim() || null,
        p_health: health || null,
        p_dbh_in: dbhIn === "" ? null : Number(dbhIn),
        p_notes:
          [
            notes?.trim() || null,
            adoptName?.trim() ? `Adopted name: ${adoptName.trim()}` : null,
            ageClass ? `Age class: ${ageClass}` : null,
            bldSigns ? `Beech leaf disease signs: ${bldSigns}` : null,
            photoUrl ? `Photo: ${photoUrl}` : null,
          ]
            .filter(Boolean)
            .join("\n") || null,
        p_observed_date: observedDate || null,
        p_lat: latNum,
        p_lng: lngNum,
      });

      if (error) return setError(error.message);

      setSpecimenId("");
      setAdoptName("");
      setHealth("Healthy");
      setAgeClass("Unknown");
      setBldSigns("Unsure");
      setDbhIn("");
      setNotes("");
      setLat("");
      setLng("");
      setGpsStatus("");
      clearDraftMarker();

      setPhotoBlob(null);
      setPhotoAvatar("");
      setPhotoStatus("");

      await refreshAll();
      setAddOpen(false);
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    }
  }

  function toggleOverlay(key) {
    setOverlayOn((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function flyToSpecimenFromRow(row) {
    const map = mapRef.current;
    if (!map) return;

    const coords = getCoordsForRow(row);
    if (!coords) return;

    map.stop();
    map.resize();

    map.easeTo({
      center: [coords.lng, coords.lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: 900,
    });

    setTimeout(() => map.resize(), 250);
  }

  async function ensureOverlayLoaded(map, overlay) {
    const sourceId = `overlay-src-${overlay.key}`;
    const fillLayerId = `overlay-fill-${overlay.key}`;
    const outlinePolyLayerId = `overlay-outline-poly-${overlay.key}`;
    const outlineLineLayerId = `overlay-outline-line-${overlay.key}`;

    if (map.getSource(sourceId)) return;

    const res = await fetch(overlay.url);
    if (!res.ok) throw new Error(`Failed to load ${overlay.label}`);
    const data = await res.json();

    setOverlayData((prev) => ({ ...prev, [overlay.key]: data }));
    map.addSource(sourceId, { type: "geojson", data });

    const token = LAYER_STYLE[overlay.key] || {
      stroke: "rgba(255,255,255,0.9)",
      fill: "rgba(255,255,255,0.10)",
      lineWidth: 2,
    };

    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      paint: { "fill-color": token.fill, "fill-opacity": 1 },
      layout: { visibility: "none" },
    });

    map.addLayer({
      id: outlinePolyLayerId,
      type: "line",
      source: sourceId,
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      paint: { "line-color": token.stroke, "line-width": token.lineWidth, "line-opacity": 1 },
      layout: { visibility: "none" },
    });

    map.addLayer({
      id: outlineLineLayerId,
      type: "line",
      source: sourceId,
      filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
      paint: { "line-color": token.stroke, "line-width": token.lineWidth + 1, "line-opacity": 1 },
      layout: { visibility: "none" },
    });
  }

  function setOverlayVisibility(map, overlayKey, visible) {
    const v = visible ? "visible" : "none";
    const fillLayerId = `overlay-fill-${overlayKey}`;
    const outlinePolyLayerId = `overlay-outline-poly-${overlayKey}`;
    const outlineLineLayerId = `overlay-outline-line-${overlayKey}`;

    if (map.getLayer(fillLayerId)) map.setLayoutProperty(fillLayerId, "visibility", v);
    if (map.getLayer(outlinePolyLayerId)) map.setLayoutProperty(outlinePolyLayerId, "visibility", v);
    if (map.getLayer(outlineLineLayerId)) map.setLayoutProperty(outlineLineLayerId, "visibility", v);
  }

  function flyToOverlay(map, overlayKey) {
    const fc = overlayData[overlayKey];
    const bounds = computeGeoJSONBounds(fc);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 70, duration: 900 });
  }

  function handleFlyToBucks() {
    const map = mapRef.current;
    if (!map) return;
    if (!overlayData.bucks_boundary) return;
    flyToOverlay(map, "bucks_boundary");
  }

  async function handleQuickPhotoTag(file) {
    if (!file) return;

    setError("");
    setPhotoStatus("");

    try {
      setPhotoStatus("Preparing quick tag…");
      await handlePickPhoto(file);

      if (!navigator.geolocation) return setError("Geolocation not supported in this browser.");

      setGpsStatus("Getting GPS…");
      const coords = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 12000 }
        );
      });

      setGpsStatus("GPS captured.");
      setDraftLocation(coords.latitude, coords.longitude);

      const autoId = `PHOTO-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 1000)}`;
      setSpecimenId(autoId);
      setAddOpen(true);
      setMenuOpen(false);
      setListOpen(false);
      setPhotoStatus("Quick tag ready — hit Save specimen.");
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    }
  }

  // Map init
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: DARK_STYLE,
      center: [-83.0, 42.3],
      zoom: 9,
    });

    mapRef.current = map;
    setMapStatus("Map: loading…");

    map.getCanvas().addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      console.warn("WebGL context lost");
      setMapStatus("Map: WebGL reset (try closing drawers)");
    });

    map.getCanvas().addEventListener("webglcontextrestored", () => {
      console.warn("WebGL context restored");
      setTimeout(() => map.resize(), 50);
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("error", (e) => {
      console.error("MapLibre error:", e?.error || e);
      setMapStatus("Map: error (check console)");
    });

    const handleResize = () => map.resize();
    window.addEventListener("resize", handleResize);

    map.on("load", async () => {
      setMapStatus("Map: ready");

      // --- Specimens source (clusters enabled) ---
      if (!map.getSource("specimens")) {
        map.addSource("specimens", {
          type: "geojson",
          data: geojson,
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 12,
        });
      }

      // --- Load custom SVG marker ---
      if (!map.hasImage("specimen-marker")) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (!map.hasImage("specimen-marker")) {
            map.addImage("specimen-marker", img, { pixelRatio: 2 });
          }
        };
        img.src = markerIcon;
      }

      // --- Clusters layer ---
      if (!map.getLayer("specimens-clusters")) {
        map.addLayer({
          id: "specimens-clusters",
          type: "circle",
          source: "specimens",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "rgba(255,255,255,0.20)",
            "circle-radius": 14,
            "circle-opacity": 0.92,
            "circle-stroke-width": 1,
            "circle-stroke-color": "rgba(255,255,255,0.28)",
          },
        });
      }

      // --- Unclustered specimens as icon ---
      if (!map.getLayer("specimens-icons")) {
        map.addLayer({
          id: "specimens-icons",
          type: "symbol",
          source: "specimens",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": "specimen-marker",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-anchor": "bottom",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 12, 0.45, 16, 0.6],
          },
        });
      }

      // --- Click handler ---
      map.on("click", (e) => {
        // 1) Specimen icon?
        const hitSpecimen = map.queryRenderedFeatures(e.point, { layers: ["specimens-icons"] });
        if (hitSpecimen && hitSpecimen.length) {
          const feature = hitSpecimen[0];
          const coords = feature.geometry?.coordinates;

          if (Array.isArray(coords) && coords.length === 2) {
            const lng = Number(coords[0]);
            const lat = Number(coords[1]);

            setSelected(feature.properties || null);
            setSelectedLngLat({ lng, lat });

            map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15) });
          } else {
            setSelected(feature.properties || null);
            setSelectedLngLat(null);
          }

          return;
        }

        // 2) Cluster?
        const hitCluster = map.queryRenderedFeatures(e.point, { layers: ["specimens-clusters"] });
        if (hitCluster && hitCluster.length) {
          const clusterId = hitCluster[0]?.properties?.cluster_id;
          if (clusterId == null) return;

          const source = map.getSource("specimens");
          if (!source?.getClusterExpansionZoom) return;

          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: hitCluster[0].geometry.coordinates, zoom });
          });

          return;
        }

        // 3) Blank map => set draft location
        const { lng, lat } = e.lngLat;
        setDraftLocation(lat, lng);
      });

      // --- Cursor behavior ---
      map.on("mouseenter", "specimens-icons", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "specimens-icons", () => (map.getCanvas().style.cursor = ""));

      map.on("mouseenter", "specimens-clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "specimens-clusters", () => (map.getCanvas().style.cursor = ""));

      // --- Overlays ---
      try {
        for (const overlay of OVERLAYS) {
          await ensureOverlayLoaded(map, overlay);
          setOverlayVisibility(map, overlay.key, !!overlayOn[overlay.key]);
        }
        if (overlayOn.bucks_boundary) setTimeout(() => flyToOverlay(map, "bucks_boundary"), 250);
      } catch (e) {
        console.error(e);
        setError(e?.message || String(e));
      }

      setTimeout(() => map.resize(), 50);
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      clearDraftMarker();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update specimens geojson
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("specimens");
    if (!source) return;
    source.setData(geojson || { type: "FeatureCollection", features: [] });
  }, [geojson]);

  // Update overlay visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const overlay of OVERLAYS) setOverlayVisibility(map, overlay.key, !!overlayOn[overlay.key]);
  }, [overlayOn]);

  const ui = {
    bg: {
      width: "100dvw",
      height: "100dvh",
      overflow: "hidden",
      overflowX: "hidden",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "clamp(14px, 2.2vw, 24px)",
      background:
        "radial-gradient(1200px 800px at 18% 12%, rgba(134, 239, 172, 0.18) 0%, rgba(11, 16, 18, 0) 55%), \
     radial-gradient(900px 700px at 88% 8%, rgba(45, 212, 191, 0.14) 0%, rgba(11, 16, 18, 0) 58%), \
     radial-gradient(900px 800px at 60% 110%, rgba(163, 230, 53, 0.08) 0%, rgba(11, 16, 18, 0) 60%), \
     linear-gradient(180deg, #070B0E 0%, #0B1415 55%, #070B0E 100%)",
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial',
      touchAction: "manipulation",
    },

    title: {
      position: "fixed",
      top: "clamp(14px, 2.2vw, 22px)",
      left: "clamp(14px, 2.2vw, 22px)",
      fontSize: "clamp(30px, 7.2vw, 72px)",
      fontWeight: 850,
      letterSpacing: "-0.06em",
      color: "rgba(255,255,255,0.94)",
      textShadow: "0 18px 60px rgba(0,0,0,0.55)",
      userSelect: "none",
      pointerEvents: "none",
      zIndex: 999,
      fontFamily:
        '"BeechDisplay", ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Helvetica, Arial',
    },

    topRight: {
      position: "fixed",
      top: "clamp(14px, 2.2vw, 22px)",
      right: "clamp(14px, 2.2vw, 22px)",
      display: "flex",
      gap: 10,
      zIndex: 50,
    },

    iconBtn: {
      width: 46,
      height: 46,
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(12,18,20,0.55)",
      color: "rgba(255,255,255,0.92)",
      display: "grid",
      placeItems: "center",
      cursor: "pointer",
      backdropFilter: "blur(10px)",
      boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
      lineHeight: 1,
      fontSize: 20,
      padding: 0,
      userSelect: "none",
    },

    iconSvg: {
      width: 22,
      height: 22,
      display: "block",
      opacity: 0.92,
      filter: "invert(1)",
    },

   insetFrame: {
  width: "100%",
  maxWidth: 1180,
  height: "min(720px, calc(100dvh - 140px))",
  margin: "0 auto",
  borderRadius: 28,
  overflow: "hidden",
  position: "relative",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 35px 120px rgba(0,0,0,0.55)",
  background: "rgba(0,0,0,0.2)",
  zIndex: 2,
},


    map: { position: "absolute", inset: 0 },

    statusPill: {
      position: "absolute",
      bottom: 16,
      left: 16,
      right: 16,
      padding: "10px 12px",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(10,14,22,0.62)",
      color: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(10px)",
      fontSize: 12,
      zIndex: 10,
      maxWidth: 520,
    },

    dropdown: {
      position: "fixed",
      top: 74,
      right: "clamp(14px, 2.2vw, 22px)",
      width: "min(340px, calc(100vw - 28px))",
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(10,14,22,0.72)",
      backdropFilter: "blur(12px)",
      boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
      padding: 12,
      zIndex: 60,
      color: "rgba(255,255,255,0.92)",
    },

    drawer: {
      position: "fixed",
      top: 90,
      right: "clamp(14px, 2.2vw, 22px)",
      width: "min(420px, calc(100vw - 28px))",
      maxHeight: "calc(100vh - 120px)",
      overflow: "auto",
      borderRadius: 20,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(10,14,22,0.78)",
      backdropFilter: "blur(12px)",
      boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
      padding: 16,
      zIndex: 70,
      color: "rgba(255,255,255,0.92)",
    },

    row: { display: "grid", gap: 12 },
    label: { fontSize: 12, opacity: 0.72 },
    input: {
      padding: "12px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
    },
    button: (primary) => ({
      padding: "12px 12px",
      borderRadius: 14,
      border: primary ? "1px solid rgba(34,197,94,0.24)" : "1px solid rgba(255,255,255,0.12)",
      background: primary ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
      color: "rgba(255,255,255,0.92)",
      cursor: "pointer",
      fontWeight: 800,
    }),
    toggle: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "12px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
    },
    chip: (key) => ({
      width: 12,
      height: 12,
      borderRadius: 4,
      background: LAYER_STYLE[key]?.fill || "rgba(255,255,255,0.10)",
      border: "1px solid rgba(255,255,255,0.18)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
    }),
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.16)",
      boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
      overflow: "hidden",
      flexShrink: 0,
      background: "rgba(255,255,255,0.06)",
    },
    small: { fontSize: 12, opacity: 0.72 },
    error: { color: "rgba(248,113,113,0.95)", fontSize: 12, marginTop: 8 },
    listItem: {
      padding: "12px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
      cursor: "pointer",
      display: "grid",
      gap: 4,
    },
  };
  return (
    <div style={ui.bg}>
      <TreePatternOverlay cell={92} opacity={0.8} zIndex={1} />
      <div style={ui.title}>BeechLens</div>

      {/* Top-right controls: Layers | List | Camera | Add */}
      <div style={ui.topRight}>
        <button
          style={ui.iconBtn}
          onClick={() => {
            setMenuOpen((v) => !v);
            setAddOpen(false);
            setListOpen(false);
          }}
          title="Layers"
          aria-label="Layers"
        >
          ☰
        </button>

        <button
          style={ui.iconBtn}
          onClick={() => {
            setListOpen((v) => !v);
            setMenuOpen(false);
            setAddOpen(false);
          }}
          title="Specimens"
          aria-label="Specimens"
        >
          <img src={treeIcon} alt="Specimens" style={ui.iconSvg} />
        </button>

        <label style={ui.iconBtn} title="Quick tag from photo">
          <img src={cameraIcon} alt="Camera" style={ui.iconSvg} />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => handleQuickPhotoTag(e.target.files?.[0] || null)}
          />
        </label>

        <button
          style={ui.iconBtn}
          onClick={() => {
            setAddOpen((v) => !v);
            setMenuOpen(false);
            setListOpen(false);
          }}
          title="Add specimen"
          aria-label="Add specimen"
        >
          ＋
        </button>
      </div>

      {/* Map inset */}
      <div style={ui.insetFrame}>
        <div ref={mapContainerRef} style={ui.map} />

        {/* Map status pill */}
        <div style={ui.statusPill}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Map</div>
          <div style={{ opacity: 0.55 }}>{mapStatus}</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Tap map to set location • drag marker • tap dots to view tag info
          </div>
        </div>

        {/* Selected popup anchored over pin */}
        {selected && selectedLngLat ? (
          <SelectedSpecimenPopup
            mapRef={mapRef}
            selected={selected}
            lngLat={selectedLngLat}
            onClose={() => {
              setSelected(null);
              setSelectedLngLat(null);
            }}
            ui={ui}
          />
        ) : null}
      </div>

      {/* Layers dropdown */}
      {menuOpen && (
        <div style={ui.dropdown}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 850 }}>Layers</div>
            <button style={ui.button(false)} onClick={() => setMenuOpen(false)}>
              Close
            </button>
          </div>

          <div style={{ height: 10 }} />

          <div style={ui.row}>
            {OVERLAYS.map((o) => (
              <div key={o.key} style={ui.toggle}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={ui.chip(o.key)} />
                  <span style={{ fontWeight: 750 }}>{o.label}</span>
                </div>
                <input
                  type="checkbox"
                  checked={!!overlayOn[o.key]}
                  onChange={() => toggleOverlay(o.key)}
                  style={{ width: 18, height: 18 }}
                />
              </div>
            ))}

            <button style={ui.button(true)} onClick={handleFlyToBucks}>
              Fly to Bucks County
            </button>
          </div>
        </div>
      )}

      {/* Specimen list drawer */}
      {listOpen && (
        <div style={ui.drawer}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 900 }}>Tagged specimens</div>
            <button style={ui.button(false)} onClick={() => setListOpen(false)}>
              Close
            </button>
          </div>

          <div style={{ height: 10 }} />

          {specimenList.length === 0 ? (
            <div style={ui.small}>No specimens yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {specimenList.map((r) => (
                <div
                  key={r.id}
                  style={ui.listItem}
                  onClick={() => {
                    setSelected(r);

                    const c = getCoordsForRow(r);
                    setSelectedLngLat(c ? { lng: c.lng, lat: c.lat } : null);

                    flyToSpecimenFromRow(r);
                    setListOpen(false);
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{r.specimen_id}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    {r.species || "Unknown"} • {r.health || "Unknown"}
                  </div>
                  <div style={ui.small}>{r.observed_date ? `Observed: ${r.observed_date}` : "Observed: —"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add specimen drawer */}
      {addOpen && (
        <div style={ui.drawer}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 900 }}>Add specimen</div>
            <button style={ui.button(false)} onClick={() => setAddOpen(false)}>
              Close
            </button>
          </div>

          <div style={{ height: 10 }} />

          <form onSubmit={handleCreate} style={ui.row}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={ui.label}>Specimen ID (tag)</label>
              <input
                value={specimenId}
                onChange={(e) => setSpecimenId(e.target.value)}
                placeholder="e.g., DEMO-014"
                style={ui.input}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={ui.label}>Adopt-a-tree name (optional)</label>
              <input
                value={adoptName}
                onChange={(e) => setAdoptName(e.target.value)}
                placeholder="e.g., Fern, Big Daddy Beech, etc."
                style={ui.input}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={ui.label}>Species</label>
                <input value={species} onChange={(e) => setSpecies(e.target.value)} style={ui.input} />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={ui.label}>Health</label>
                <select value={health} onChange={(e) => setHealth(e.target.value)} style={ui.input}>
                  {HEALTH_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} style={{ color: "#0b0f19" }}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={ui.label}>Age class</label>
                <select value={ageClass} onChange={(e) => setAgeClass(e.target.value)} style={ui.input}>
                  {AGE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} style={{ color: "#0b0f19" }}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={ui.label}>Signs of Beech Leaf Disease?</label>
                <select value={bldSigns} onChange={(e) => setBldSigns(e.target.value)} style={ui.input}>
                  {BLD_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} style={{ color: "#0b0f19" }}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={ui.label}>DBH (inches)</label>
                <input
                  value={dbhIn}
                  onChange={(e) => setDbhIn(e.target.value)}
                  inputMode="decimal"
                  placeholder="optional"
                  style={ui.input}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label style={ui.label}>Observed date</label>
                <input
                  type="date"
                  value={observedDate}
                  onChange={(e) => setObservedDate(e.target.value)}
                  style={ui.input}
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={ui.label}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="optional"
                rows={3}
                style={{ ...ui.input, minHeight: 92, resize: "vertical" }}
              />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={ui.avatar}>
                    {photoAvatar ? (
                      <img src={photoAvatar} alt="avatar preview" style={{ width: "100%", height: "100%" }} />
                    ) : null}
                  </div>
                  <div>
                    <div style={{ fontWeight: 850 }}>Specimen photo</div>
                    <div style={ui.small}>{photoStatus || "Optional (creates avatar preview)"}</div>
                  </div>
                </div>

                <label style={{ ...ui.button(false), cursor: "pointer" }}>
                  Add photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handlePickPhoto(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" onClick={handleUseGPS} style={ui.button(false)}>
                  Use GPS
                </button>
                <button type="button" onClick={flyToGPS} style={ui.button(false)}>
                  Fly to GPS
                </button>
                <span style={ui.small}>{gpsStatus}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={ui.label}>Latitude</label>
                  <input value={lat} onChange={(e) => setLat(e.target.value)} style={ui.input} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={ui.label}>Longitude</label>
                  <input value={lng} onChange={(e) => setLng(e.target.value)} style={ui.input} />
                </div>
              </div>
            </div>

            <button type="submit" disabled={!canSubmit} style={{ ...ui.button(true), opacity: canSubmit ? 1 : 0.45 }}>
              Save specimen
            </button>

            {error ? <div style={ui.error}>Error: {error}</div> : null}
          </form>
        </div>
      )}
    </div>
  );
}
