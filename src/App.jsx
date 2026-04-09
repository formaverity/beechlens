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

/**
 * Responsive breakpoint (matches the CSS in this file)
 * - Mobile: <= 820px
 * - Desktop: > 820px
 */
const MOBILE_MAX_W = 820;

const DARK_STYLE = {
  version: 8,
  name: "BeechLens Minimal Field",
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    carto_light: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
        "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
        "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
        "https://d.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#dfe9d8",
      },
    },
    {
      id: "carto-light",
      type: "raster",
      source: "carto_light",
      paint: {
        "raster-opacity": 0.40,
        "raster-saturation": -1,
        "raster-contrast": 0.15,
        "raster-brightness-min": 0.2,
        "raster-brightness-max": 0.92,
      },
    },
  ],
};

const OVERLAYS = [
  { key: "bucks_boundary", label: "Bucks County Boundary", url: "/overlays/bucks_boundary.geojson" },
  { key: "state_forests", label: "State Forests", url: "/overlays/state_forests.geojson" },
  { key: "state_parks", label: "State Parks", url: "/overlays/state_parks.geojson" },
  { key: "bucks_parks", label: "Bucks County Parks", url: "/overlays/bucks_parks.geojson" },
];

const TREE_SVGS = ["/patterns/Tree-01.svg", "/patterns/Tree-02.svg", "/patterns/Tree-03.svg"];

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!window.matchMedia?.(query)?.matches;
  });

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;

    const onChange = () => setMatches(mq.matches);
    onChange();

    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [query]);

  return matches;
}

function hash2D(x, y) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return Math.abs(n);
}

const LAYER_STYLE = {
  bucks_boundary: {
    stroke: "rgba(48, 66, 52, 0.72)",
    fill: "rgba(92, 115, 94, 0.03)",
    lineWidth: 2.2,
  },
  state_forests: {
    stroke: "rgba(92, 127, 98, 0.55)",
    fill: "rgba(140, 170, 138, 0.12)",
    lineWidth: 1.5,
  },
  state_parks: {
    stroke: "rgba(112, 138, 116, 0.5)",
    fill: "rgba(160, 184, 155, 0.10)",
    lineWidth: 1.4,
  },
  bucks_parks: {
    stroke: "rgba(128, 150, 120, 0.44)",
    fill: "rgba(170, 190, 164, 0.08)",
    lineWidth: 1.2,
  },
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
    borderRadius: 18,
    border: "1px solid rgba(64, 83, 68, 0.12)",
    background: "rgba(245, 249, 242, 0.94)",
    color: "#223126",
    backdropFilter: "blur(12px)",
    boxShadow: "0 18px 44px rgba(53, 66, 53, 0.12)",
    pointerEvents: "auto",
  }}
>
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900, lineHeight: 1.1 }}>{selected?.specimen_id || "Specimen"}</div>
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

        <div style={{ opacity: 0.72, marginTop: 6, fontSize: 12 }}>
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
                border: "1px solid rgba(64, 83, 68, 0.10)",
boxShadow: "0 12px 28px rgba(53, 66, 53, 0.10)",
                display: "block",
              }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        ) : null}

        <div style={{ opacity: 0.76, marginTop: 10, fontSize: 12, whiteSpace: "pre-wrap" }}>
  {cleanedNotes || "No notes"}
</div>

        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.52 }}>
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

  const isMobile = useMediaQuery(`(max-width: ${MOBILE_MAX_W}px)`);

  const [selectedLngLat, setSelectedLngLat] = useState(null); // { lng, lat }
  const [error, setError] = useState("");
  const [mapStatus, setMapStatus] = useState("Map: initializing…");

  const [specimenList, setSpecimenList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [geojson, setGeojson] = useState({ type: "FeatureCollection", features: [] });

  const [overlayData, setOverlayData] = useState({});
    const [overlayOn, setOverlayOn] = useState(() => {
    const initial = {};
    for (const o of OVERLAYS) initial[o.key] = true;
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
  // Map status chip (collapsed/expanded)
const [statusOpen, setStatusOpen] = useState(() => !isMobile); // desktop starts open, mobile starts collapsed

// Auto-collapse on mobile landscape (prevents covering the map)
useEffect(() => {
  if (!isMobile) {
    setStatusOpen(true);
    return;
  }

  const mqLandscape = window.matchMedia?.("(orientation: landscape)");
  const apply = () => {
    const landscape = mqLandscape?.matches ?? (window.innerWidth > window.innerHeight);
    // If landscape on mobile, collapse. If portrait, keep your last choice (don’t force open).
    if (landscape) setStatusOpen(false);
  };

  apply();
  mqLandscape?.addEventListener?.("change", apply);
  window.addEventListener("resize", apply);

  return () => {
    mqLandscape?.removeEventListener?.("change", apply);
    window.removeEventListener("resize", apply);
  };
}, [isMobile]);


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
    refreshAll();
  }, []);

  // Prevent page scrollbars + make viewport stable on mobile
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlH = html.style.height;
    const prevBodyH = body.style.height;
    const prevOverflow = body.style.overflow;

    html.style.height = "100%";
    body.style.height = "100%";
    body.style.overflow = "hidden";

    return () => {
      html.style.height = prevHtmlH;
      body.style.height = prevBodyH;
      body.style.overflow = prevOverflow;
    };
  }, []);

  // Resize map when drawers open/close, and when switching mobile/desktop layout
  useEffect(() => {
    bumpMapResize(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, addOpen, listOpen, isMobile]);

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
    map.fitBounds(bounds, { padding: isMobile ? 40 : 70, duration: 900 });
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
  center: [-75.15, 40.28], // Bucks County region
  zoom: 10.4,
  minZoom: 8.6,
  maxZoom: 18,
  attributionControl: false,
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

    map.addControl(
  new maplibregl.NavigationControl({
    visualizePitch: false,
    showCompass: false,
  }),
  "bottom-right"
);

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

           // --- Load custom SVG marker (inverted) ---
      async function ensureInvertedMarker() {
        if (map.hasImage("specimen-marker")) return;

        const img = new Image();
        img.decoding = "async";

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = markerIcon;
        });

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Could not create canvas context for specimen marker.");

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];
          data[i + 1] = 255 - data[i + 1];
          data[i + 2] = 255 - data[i + 2];
        }

        if (map.hasImage("specimen-marker")) {
          map.removeImage("specimen-marker");
        }

        map.addImage(
          "specimen-marker",
          {
            width: imageData.width,
            height: imageData.height,
            data: imageData.data,
          },
          { pixelRatio: 2 }
        );
      }

      await ensureInvertedMarker();

      // --- Clusters layer ---
      if (!map.getLayer("specimens-clusters")) {
  map.addLayer({
    id: "specimens-clusters",
    type: "circle",
    source: "specimens",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "rgba(53, 72, 57, 0.10)",
      "circle-radius": [
        "step",
        ["get", "point_count"],
        12,
        12,
        15,
        30,
        18,
      ],
      "circle-opacity": 1,
      "circle-stroke-width": 1.25,
      "circle-stroke-color": "rgba(53, 72, 57, 0.22)",
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
            "icon-anchor": "bottom",
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8, 0.24,
              12, 0.36,
              16, 0.54,
            ],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: {
            "icon-opacity": 0.96,
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

  // --- UI style helpers (kept close to your original styling) ---
  const ui = {
    shell: {
      position: "relative",
      width: "100%",
      height: "100dvh",
      overflow: "hidden",
      background: "#dfe9d8",
      color: "#233127",
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },

    mapStage: {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      background: "#dfe9d8",
    },

    mapRoot: {
      position: "absolute",
      inset: 0,
    },

    floatingHeader: {
      position: "absolute",
      top: "max(16px, env(safe-area-inset-top))",
      left: "max(16px, env(safe-area-inset-left))",
      right: "max(16px, env(safe-area-inset-right))",
      zIndex: 30,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      pointerEvents: "none",
    },

    headerCard: {
      pointerEvents: "auto",
      display: "grid",
      gap: 8,
      width: isMobile ? "min(100%, 420px)" : "min(480px, 44vw)",
      padding: isMobile ? "14px 14px 12px" : "16px 16px 14px",
      borderRadius: 22,
      border: "1px solid rgba(64, 83, 68, 0.12)",
      background: "rgba(245, 249, 242, 0.84)",
      backdropFilter: "blur(16px)",
      boxShadow: "0 18px 48px rgba(53, 66, 53, 0.10)",
    },

    title: {
      fontFamily:
        '"BeechDisplay", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: isMobile ? 24 : 30,
      lineHeight: 0.95,
      letterSpacing: "-0.03em",
      margin: 0,
      color: "#1f2c22",
    },

    eyebrow: {
      margin: 0,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "rgba(43, 58, 46, 0.62)",
    },

    intro: {
      margin: 0,
      fontSize: isMobile ? 12.5 : 13,
      lineHeight: 1.45,
      color: "rgba(40, 53, 43, 0.78)",
      maxWidth: "56ch",
    },

    headerActions: {
      pointerEvents: "auto",
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      justifyContent: "flex-end",
      maxWidth: isMobile ? "46vw" : "unset",
    },

    pillButton: (active = false) => ({
      appearance: "none",
      WebkitAppearance: "none",
      border: active
        ? "1px solid rgba(51, 77, 56, 0.22)"
        : "1px solid rgba(51, 77, 56, 0.12)",
      background: active
  ? "rgba(228, 236, 224, 0.95)"
  : "rgba(245, 249, 242, 0.84)",
      color: "#243126",
      borderRadius: 999,
      padding: isMobile ? "10px 12px" : "10px 14px",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.01em",
      cursor: "pointer",
      backdropFilter: "blur(12px)",
      boxShadow: "0 10px 26px rgba(53, 66, 53, 0.08)",
      transition: "background 160ms ease, border-color 160ms ease, transform 160ms ease",
      whiteSpace: "nowrap",
    }),

    statusCard: {
      position: "absolute",
      left: "max(16px, env(safe-area-inset-left))",
      bottom: "max(16px, calc(env(safe-area-inset-bottom) + 8px))",
      zIndex: 22,
      width: isMobile ? "min(calc(100vw - 32px), 360px)" : "min(420px, 30vw)",
      pointerEvents: "auto",
      borderRadius: statusOpen ? 20 : 999,
      border: "1px solid rgba(64, 83, 68, 0.12)",
      background: "rgba(245, 249, 242, 0.92)",
      backdropFilter: "blur(14px)",
      boxShadow: "0 18px 44px rgba(53, 66, 53, 0.10)",
      padding: statusOpen ? "12px 14px 14px" : "10px 14px",
      cursor: "pointer",
      color: "#263329",
    },

    statusTitleRow: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      lineHeight: 1,
    },

    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
      background: "#556f5b",
      boxShadow: "0 0 0 4px rgba(85,111,91,0.10)",
      flex: "0 0 auto",
    },

    statusTitle: {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: "0.02em",
    },

    statusBody: {
      marginTop: 8,
      display: "grid",
      gap: 6,
      fontSize: 12,
      lineHeight: 1.4,
      color: "rgba(39, 53, 42, 0.78)",
    },

    drawer: {
      position: "absolute",
      top: isMobile ? "84px" : "92px",
      right: "max(16px, env(safe-area-inset-right))",
      bottom: "max(16px, env(safe-area-inset-bottom))",
      zIndex: 26,
      width: isMobile ? "min(calc(100vw - 32px), 420px)" : "380px",
      maxWidth: "calc(100vw - 32px)",
      borderRadius: 24,
      border: "1px solid rgba(64, 83, 68, 0.12)",
      background: "rgba(244, 248, 241, 0.90)",
      backdropFilter: "blur(18px)",
      boxShadow: "0 24px 64px rgba(53, 66, 53, 0.12)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      pointerEvents: "auto",
    },

    drawerHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "16px 16px 14px",
      borderBottom: "1px solid rgba(64, 83, 68, 0.08)",
    },

    drawerTitle: {
      margin: 0,
      fontSize: 14,
      fontWeight: 800,
      letterSpacing: "0.01em",
      color: "#213024",
    },

    drawerBody: {
      padding: "14px 16px 16px",
      overflowY: "auto",
      minHeight: 0,
      display: "grid",
      gap: 12,
    },

    button: (strong = false) => ({
      appearance: "none",
      WebkitAppearance: "none",
      border: strong
        ? "1px solid rgba(44, 67, 49, 0.26)"
        : "1px solid rgba(64, 83, 68, 0.14)",
      background: strong ? "#e7eee4" : "rgba(255,255,255,0.55)",
      color: "#203024",
      borderRadius: 14,
      padding: "10px 12px",
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
    }),

    input: {
      width: "100%",
      borderRadius: 14,
      border: "1px solid rgba(64, 83, 68, 0.12)",
      background: "rgba(255,255,255,0.72)",
      color: "#203024",
      padding: "11px 12px",
      fontSize: 14,
      outline: "none",
    },

    textarea: {
      width: "100%",
      minHeight: 120,
      resize: "vertical",
      borderRadius: 14,
      border: "1px solid rgba(64, 83, 68, 0.12)",
      background: "rgba(255,255,255,0.72)",
      color: "#203024",
      padding: "11px 12px",
      fontSize: 14,
      outline: "none",
    },

    label: {
      display: "grid",
      gap: 6,
      fontSize: 12,
      fontWeight: 700,
      color: "rgba(39, 53, 42, 0.82)",
    },

    helper: {
      fontSize: 11,
      color: "rgba(39, 53, 42, 0.60)",
      lineHeight: 1.4,
    },

    overlayRow: {
      display: "grid",
      gridTemplateColumns: "14px 1fr auto",
      alignItems: "center",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(64, 83, 68, 0.08)",
      background: "rgba(255,255,255,0.42)",
    },

    chip: (key) => ({
      width: 12,
      height: 12,
      borderRadius: 999,
      background: LAYER_STYLE[key]?.fill || "rgba(64, 83, 68, 0.12)",
      border: `1px solid ${LAYER_STYLE[key]?.stroke || "rgba(64, 83, 68, 0.24)"}`,
    }),
  };

  // CSS lives here to keep this “single-file” drop-in
    const shellCss = `
    .beechlens-map-root,
    .beechlens-map-root * {
      box-sizing: border-box;
    }

    .beechlens-map-root button,
    .beechlens-map-root input,
    .beechlens-map-root select,
    .beechlens-map-root textarea {
      font: inherit;
    }

    .beechlens-map-root input::placeholder,
    .beechlens-map-root textarea::placeholder {
      color: rgba(39, 53, 42, 0.42);
    }

    .beechlens-map-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(80, 98, 84, 0.24) transparent;
    }

    .beechlens-map-scroll::-webkit-scrollbar {
      width: 10px;
    }

    .beechlens-map-scroll::-webkit-scrollbar-track {
      background: transparent;
    }

    .beechlens-map-scroll::-webkit-scrollbar-thumb {
      background: rgba(80, 98, 84, 0.18);
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }

    .beechlens-drawer-enter {
      animation: beechlensDrawerIn 180ms ease-out;
    }

    @keyframes beechlensDrawerIn {
      from {
        opacity: 0;
        transform: translateY(8px) translateX(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0) translateX(0);
      }
    }

    @media (max-width: 820px) {
      .beechlens-header-stack {
        flex-direction: column;
        align-items: stretch;
      }

      .beechlens-header-actions {
        justify-content: flex-start;
      }
    }
  `;

  return (
    <div className="beechlens-map-root" style={ui.shell}>
      <style>{shellCss}</style>

            <div style={ui.mapStage}>
        <div ref={mapContainerRef} style={ui.mapRoot} />
      </div>

      <div className="beechlens-header-stack" style={ui.floatingHeader}>
        <div style={ui.headerCard}>
          <p style={ui.eyebrow}>Bucks County beech census</p>
          <h1 style={ui.title}>BeechLens</h1>
          <p style={ui.intro}>
            A minimal spatial field for noticing, tracking, and caring for beech trees
            across parks, forests, and local landscapes.
          </p>
        </div>

        <div className="beechlens-header-actions" style={ui.headerActions}>
          <button
            type="button"
            style={ui.pillButton(menuOpen)}
            onClick={() => {
              setMenuOpen((v) => !v);
              setAddOpen(false);
              setListOpen(false);
            }}
          >
            Layers
          </button>

          <button
            type="button"
            style={ui.pillButton(addOpen)}
            onClick={() => {
              setAddOpen((v) => !v);
              setMenuOpen(false);
              setListOpen(false);
            }}
          >
            Add specimen
          </button>

          <button
            type="button"
            style={ui.pillButton(listOpen)}
            onClick={() => {
              setListOpen((v) => !v);
              setMenuOpen(false);
              setAddOpen(false);
            }}
          >
            Specimens
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setStatusOpen((v) => !v)}
        style={ui.statusCard}
        aria-expanded={statusOpen}
        aria-label="Toggle map status"
      >
        <div style={ui.statusTitleRow}>
          <div style={ui.statusDot} />
          <div style={ui.statusTitle}>Field status</div>
          <div style={{ marginLeft: "auto", opacity: 0.58, fontSize: 12 }}>
            {statusOpen ? "−" : "+"}
          </div>
        </div>

        {statusOpen ? (
          <div style={ui.statusBody}>
            <div>{mapStatus}</div>
            <div>{geojson?.features?.length || 0} mapped specimens loaded</div>
            <div>{Object.values(overlayOn).filter(Boolean).length} overlay layers visible</div>
            {error ? <div style={{ color: "#8d3e3e" }}>{error}</div> : null}
          </div>
        ) : null}
      </button>

      {menuOpen ? (
        <section className="beechlens-drawer-enter" style={ui.drawer}>
          <div style={ui.drawerHeader}>
            <h2 style={ui.drawerTitle}>Visible layers</h2>
            <button type="button" style={ui.button(false)} onClick={() => setMenuOpen(false)}>
              Close
            </button>
          </div>

          <div className="beechlens-map-scroll" style={ui.drawerBody}>
            <div style={ui.helper}>
              Toggle geographic context so the field stays quiet and the specimens remain primary.
            </div>

            {OVERLAYS.map((overlay) => (
              <label key={overlay.key} style={ui.overlayRow}>
                <span style={ui.chip(overlay.key)} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{overlay.label}</span>
                <input
                  type="checkbox"
                  checked={!!overlayOn[overlay.key]}
                  onChange={() => toggleOverlay(overlay.key)}
                />
              </label>
            ))}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={ui.button(false)}
                onClick={() =>
                  setOverlayOn({
                    bucks_boundary: true,
                    state_forests: true,
                    state_parks: false,
                    bucks_parks: false,
                  })
                }
              >
                Minimal context
              </button>

              <button
                type="button"
                style={ui.button(false)}
                onClick={() =>
                  setOverlayOn({
                    bucks_boundary: true,
                    state_forests: true,
                    state_parks: true,
                    bucks_parks: true,
                  })
                }
              >
                Show all
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {addOpen ? (
        <section className="beechlens-drawer-enter" style={ui.drawer}>
          <div style={ui.drawerHeader}>
            <h2 style={ui.drawerTitle}>Add a specimen</h2>
            <button type="button" style={ui.button(false)} onClick={() => setAddOpen(false)}>
              Close
            </button>
          </div>

          <form className="beechlens-map-scroll" style={ui.drawerBody} onSubmit={handleCreate}>
            <label style={ui.label}>
              Specimen ID
              <input
                style={ui.input}
                value={specimenId}
                onChange={(e) => setSpecimenId(e.target.value)}
                placeholder="BL-001"
              />
            </label>

            <label style={ui.label}>
              Adopted name
              <input
                style={ui.input}
                value={adoptName}
                onChange={(e) => setAdoptName(e.target.value)}
                placeholder="Optional"
              />
            </label>

            <label style={ui.label}>
              Species
              <input
                style={ui.input}
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
              />
            </label>

            <label style={ui.label}>
              Health
              <select style={ui.input} value={health} onChange={(e) => setHealth(e.target.value)}>
                {HEALTH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label style={ui.label}>
              Age class
              <select style={ui.input} value={ageClass} onChange={(e) => setAgeClass(e.target.value)}>
                {AGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label style={ui.label}>
              Beech leaf disease signs
              <select style={ui.input} value={bldSigns} onChange={(e) => setBldSigns(e.target.value)}>
                {BLD_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label style={ui.label}>
              DBH (inches)
              <input
                style={ui.input}
                type="number"
                inputMode="decimal"
                value={dbhIn}
                onChange={(e) => setDbhIn(e.target.value)}
                placeholder="Optional"
              />
            </label>

            <label style={ui.label}>
              Observed date
              <input
                style={ui.input}
                type="date"
                value={observedDate}
                onChange={(e) => setObservedDate(e.target.value)}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={ui.label}>
                Latitude
                <input
                  style={ui.input}
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="Optional"
                />
              </label>

              <label style={ui.label}>
                Longitude
                <input
                  style={ui.input}
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={ui.button(false)} onClick={handleUseGPS}>
                Use GPS
              </button>
              <button type="button" style={ui.button(false)} onClick={flyToGPS}>
                Fly to me
              </button>
            </div>

            {gpsStatus ? <div style={ui.helper}>{gpsStatus}</div> : null}

            <label style={ui.label}>
              Notes
              <textarea
                style={ui.textarea}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations, habitat notes, symptoms, context..."
              />
            </label>

            <label style={ui.label}>
              Photo
              <input
                style={ui.input}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handlePickPhoto(e.target.files?.[0] || null)}
              />
            </label>

            {photoAvatar ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src={photoAvatar}
                  alt=""
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "1px solid rgba(64, 83, 68, 0.12)",
                  }}
                />
                <div style={ui.helper}>{photoStatus || "Photo attached"}</div>
              </div>
            ) : photoStatus ? (
              <div style={ui.helper}>{photoStatus}</div>
            ) : null}

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button type="submit" style={ui.button(true)} disabled={!canSubmit}>
                Save specimen
              </button>
              <button type="button" style={ui.button(false)} onClick={() => setAddOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {listOpen ? (
        <section className="beechlens-drawer-enter" style={ui.drawer}>
          <div style={ui.drawerHeader}>
            <h2 style={ui.drawerTitle}>Recent specimens</h2>
            <button type="button" style={ui.button(false)} onClick={() => setListOpen(false)}>
              Close
            </button>
          </div>

          <div className="beechlens-map-scroll" style={ui.drawerBody}>
            <div style={ui.helper}>
              Select a specimen to fly to its mapped location.
            </div>

            {specimenList.length === 0 ? (
              <div style={ui.helper}>No specimens loaded yet.</div>
            ) : (
              specimenList.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    flyToSpecimenFromRow(row);
                    setSelected(row);
                    const coords = getCoordsForRow(row);
                    setSelectedLngLat(coords || null);
                  }}
                  style={{
                    textAlign: "left",
                    borderRadius: 16,
                    border: "1px solid rgba(64, 83, 68, 0.08)",
                    background: "rgba(255,255,255,0.42)",
                    padding: "12px 12px",
                    cursor: "pointer",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#233126" }}>
                    {row.specimen_id || "Untitled specimen"}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(39, 53, 42, 0.70)" }}>
                    {row.species || "Unknown species"} • {row.health || "Unknown health"}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(39, 53, 42, 0.56)" }}>
                    {row.observed_date || "No observation date"}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}

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
  );
}
