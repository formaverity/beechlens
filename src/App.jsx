import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { createRoot } from "react-dom/client";
import { supabase } from "./lib/supabase";
import markerIcon from "./assets/Tree-01.svg";

const HEALTH_OPTIONS = ["Healthy", "Stressed", "Declining", "Dead"];
const AGE_OPTIONS = ["Sapling", "Young", "Mature", "Old", "Unknown"];
const BLD_OPTIONS = ["Yes", "No", "Unsure"];

const GUIDE_SECTIONS = [
  {
    title: "Identify a beech tree",
    description: "American beech trees have distinctive features that make them easy to spot in the field.",
    bullets: [
      "Smooth, light-gray bark that remains smooth even on mature trees",
      "Long, pointed winter buds",
      "Oval leaves with straight, parallel side veins",
      "Field tip: Look for smooth bark + pointed buds + regular side veins"
    ],
    imageQueries: ["american beech smooth gray bark", "beech tree long pointed winter buds"],
    imagePaths: ["/quickguide/beechtree/01.jpg", "/quickguide/beechtree/02.jpg"],
    sourceLabel: "Penn State Extension - Guide to Beech Leaf Disease",
    sourceUrl: "https://extension.psu.edu/guide-to-beech-leaf-disease-for-the-public/"
  },
  {
    title: "Early beech leaf disease",
    description: "Early symptoms of beech leaf disease are subtle but characteristic.",
    bullets: [
      "Dark banding between the veins on the leaf underside",
      "Easiest to see from below the leaf in sunlight",
      "Subtle curling or wrinkling of the leaf edges"
    ],
    imageQueries: ["beech leaf disease dark banding between veins", "beech leaf disease curled thickened leaves"],
    imagePaths: ["/quickguide/early/01.jpg", "/quickguide/early/02.jpg"],
    sourceLabel: "Penn State Extension - Beech Leaf Disease",
    sourceUrl: "https://extension.psu.edu/beech-leaf-disease/"
  },
  {
    title: "Later-stage decline / mistaken identity",
    description: "As the disease progresses, symptoms become more obvious, but be careful not to mistake other issues.",
    bullets: [
      "Thickened, curled leaves",
      "Thinning canopy with sparse foliage",
      "Note: Random spots or powdery mildew are not the same pattern",
      "Not sure? Tag it anyway and mark symptoms as Unsure."
    ],
    imageQueries: ["beech leaf disease thickened curled leaves", "beech tree thinning canopy"],
    imagePaths: ["/quickguide/advanced/01.jpg", "/quickguide/advanced/02.jpg"],
    sourceLabel: "National Park Service - Beech Leaf Disease: Mistaken Identity",
    sourceUrl: "https://www.nps.gov/articles/000/bld-mistaken-identity.htm"
  }
];

const MOBILE_MAX_W = 820;

const FIELD_STYLE = {
  version: 8,
  name: "BeechLens Field",
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
    carto_labels: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
        "https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
        "https://c.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
        "https://d.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#f3f1e8",
      },
    },
    {
      id: "carto-light",
      type: "raster",
      source: "carto_light",
      paint: {
        "raster-opacity": 0.34,
        "raster-saturation": -1,
        "raster-contrast": 0.08,
        "raster-brightness-min": 0.28,
        "raster-brightness-max": 0.96,
      },
    },
    {
      id: "carto-labels",
      type: "raster",
      source: "carto_labels",
      paint: {
        "raster-opacity": 0.82,
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

const LAYER_STYLE = {
  bucks_boundary: {
    stroke: "#2a7466",
    fill: "rgba(42, 116, 102, 0.05)",
    lineWidth: 2.2,
  },
  state_forests: {
    stroke: "#56c795",
    fill: "rgba(86, 199, 149, 0.11)",
    lineWidth: 1.5,
  },
  state_parks: {
    stroke: "#a48226",
    fill: "rgba(164, 130, 38, 0.08)",
    lineWidth: 1.4,
  },
  bucks_parks: {
    stroke: "#d0cd4e",
    fill: "rgba(208, 205, 78, 0.12)",
    lineWidth: 1.2,
  },
};

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

function computeGeoJSONBounds(fc) {
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

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

  if (!Number.isFinite(minLng)) return null;

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
    if (!ctx) throw new Error("Could not create image canvas.");

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
        if (!ctx) throw new Error("Could not create avatar canvas.");

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

function SelectedSpecimenPopup({
  mapRef,
  selected,
  lngLat,
  selectedPhotos,
  onClose,
  onEdit,
}) {
  const popupRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const map = mapRef?.current;
    if (!map) return;

    const lng = Number(lngLat?.lng);
    const lat = Number(lngLat?.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    try {
      rootRef.current?.unmount?.();
    } catch {
      // noop
    }
    rootRef.current = null;

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    const el = document.createElement("div");
    el.style.maxWidth = "360px";

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 20,
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
    const latestPhoto = selectedPhotos?.[0]?.photo_url || photoUrl || null;

    root.render(
      <div
        style={{
          padding: "14px 0 0",
          minWidth: "280px",
          maxWidth: "360px",
          pointerEvents: "auto",
          color: "var(--bl-text)",
          fontFamily: "var(--font-body)",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 10,
            borderTop: "1px solid var(--bl-line-strong)",
            paddingTop: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  lineHeight: 1.2,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--bl-text-soft)",
                }}
              >
                Specimen
              </div>
              <div
                style={{
                  fontFamily: "var(--font-heading-alt)",
                  fontSize: 15,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {selected?.properties?.specimen_id || selected?.specimen_id || "Untitled"}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close specimen"
              title="Close"
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--bl-text-soft)",
                borderBottom: "1px solid var(--bl-line-strong)",
                paddingBottom: 3,
                cursor: "pointer",
                background: "transparent",
              }}
            >
              Close
            </button>
          </div>

          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              lineHeight: 1.35,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--bl-text-soft)",
            }}
          >
            {(selected?.properties?.species || selected?.species || "Unknown")} · {(selected?.properties?.health || selected?.health || "Unknown")}
          </div>

          {latestPhoto ? (
            <img
              src={latestPhoto}
              alt="Specimen"
              loading="lazy"
              style={{
                width: "100%",
                maxHeight: 190,
                objectFit: "cover",
                display: "block",
                border: "1px solid var(--bl-line)",
              }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}

          <div
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--bl-text)",
              whiteSpace: "pre-wrap",
            }}
          >
            {cleanedNotes || "No notes"}
          </div>

          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              lineHeight: 1.35,
              letterSpacing: "0.04em",
              color: "var(--bl-text-faint)",
            }}
          >
            {selectedPhotos?.length || 0} photo{selectedPhotos?.length === 1 ? "" : "s"} logged
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onEdit}
              style={{
                border: "1px solid var(--bl-line)",
                background: "transparent",
                color: "var(--bl-text)",
                padding: "8px 10px",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                lineHeight: 1.2,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Edit specimen
            </button>
          </div>

          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              lineHeight: 1.35,
              letterSpacing: "0.04em",
              color: "var(--bl-text-faint)",
            }}
          >
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
        </div>
      </div>
    );

    const sync = () => popup.setLngLat([lng, lat]);
    map.on("move", sync);

    return () => {
      map.off("move", sync);

      try {
        rootRef.current?.unmount?.();
      } catch {
        // noop
      }
      rootRef.current = null;

      popup.remove();
      popupRef.current = null;
    };
  }, [lngLat, mapRef, onClose, onEdit, selected, selectedPhotos]);

  return null;
}

function RuleButton({ label, active = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-rule-button"
      data-active={active ? "true" : "false"}
      style={{
        fontFamily: "var(--font-ui)",
        fontSize: 12,
        lineHeight: 1.2,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}

function makeAutoSpecimenId(prefix = "BL") {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${stamp}-${rand}`;
}

function StatCard({ label, value, sublabel }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        padding: "12px 0",
        borderTop: "1px solid var(--bl-line)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          lineHeight: 1.2,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--bl-text-soft)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-heading-alt)",
          fontSize: 20,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          color: "var(--bl-text)",
        }}
      >
        {value}
      </div>
      {sublabel ? (
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            lineHeight: 1.45,
            color: "var(--bl-text-faint)",
          }}
        >
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

function TinyLineChart({ data = [], height = 100 }) {
  if (!data.length) {
    return (
      <div
        style={{
          padding: "10px 0",
          fontFamily: "var(--font-body)",
          fontSize: 13,
          lineHeight: 1.45,
          color: "var(--bl-text-faint)",
        }}
      >
        No data yet.
      </div>
    );
  }

  // Sort data by day
  const sortedData = [...data].sort((a, b) => new Date(a.day) - new Date(b.day));
  const counts = sortedData.map(d => Number(d.count) || 0);
  const maxCount = Math.max(...counts, 1);
  const minCount = Math.min(...counts, 0);

  const width = 300; // Fixed width for simplicity
  const padding = 20;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;

  const points = sortedData.map((d, i) => {
    const x = padding + (i / (sortedData.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((Number(d.count) || 0) / maxCount) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = points + ` ${padding + chartWidth},${padding + chartHeight} ${padding},${padding + chartHeight}`;

  const formatDate = (day) => {
    try {
      const date = new Date(day);
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } catch {
      return day;
    }
  };

  return (
    <div style={{ position: 'relative', height, width: '100%', paddingTop: 10 }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }}>
        {/* Subtle grid lines */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(42,116,102,0.1)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Area under line */}
        <path d={`M ${areaPoints}`} fill="rgba(86, 199, 149, 0.08)" stroke="none" />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#56c795"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots for data points */}
        {sortedData.map((d, i) => {
          const x = padding + (i / (sortedData.length - 1 || 1)) * chartWidth;
          const y = padding + chartHeight - ((Number(d.count) || 0) / maxCount) * chartHeight;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3"
              fill="#56c795"
              opacity="0.7"
            />
          );
        })}
      </svg>

      {/* Labels */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: padding,
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        color: 'var(--bl-text-faint)',
        textAlign: 'left'
      }}>
        {formatDate(sortedData[0]?.day)}
      </div>
      <div style={{
        position: 'absolute',
        bottom: 0,
        right: padding,
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        color: 'var(--bl-text-faint)',
        textAlign: 'right'
      }}>
        {formatDate(sortedData[sortedData.length - 1]?.day)}
      </div>
    </div>
  );
}

function HorizontalBreakdown({ data = [] }) {
  if (!data.length) {
    return (
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          lineHeight: 1.45,
          color: "var(--bl-text-faint)",
        }}
      >
        No data yet.
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + (Number(item.count) || 0), 0) || 1;

  return (
    <div style={{ display: "grid", gap: 10, paddingTop: 6 }}>
      {data.map((item) => {
        const count = Number(item.count) || 0;
        const pct = (count / total) * 100;

        return (
          <div key={item.label} style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "baseline",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  lineHeight: 1.35,
                  color: "var(--bl-text)",
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  lineHeight: 1.2,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--bl-text-soft)",
                }}
              >
                {count}
              </div>
            </div>

            <div
              style={{
                height: 10,
                border: "1px solid var(--bl-line)",
                background: "rgba(255,255,255,0.28)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: "rgba(86, 199, 149, 0.18)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const draftMarkerRef = useRef(null);

  const isMobile = useMediaQuery(`(max-width: ${MOBILE_MAX_W}px)`);

  const [selectedLngLat, setSelectedLngLat] = useState(null);
  const [error, setError] = useState("");
  const [mapStatus, setMapStatus] = useState("Map: initializing…");

  const [specimenList, setSpecimenList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [geojson, setGeojson] = useState({ type: "FeatureCollection", features: [] });

  const [overlayData, setOverlayData] = useState({});
  const [overlayOn, setOverlayOn] = useState(() => {
    const initial = {};
    for (const o of OVERLAYS) initial[o.key] = true;
    return initial;
  });

  const [statusOpen, setStatusOpen] = useState(() => !isMobile);

const [menuOpen, setMenuOpen] = useState(false);
const [addOpen, setAddOpen] = useState(false);
const [listOpen, setListOpen] = useState(false);
const [quickTagOpen, setQuickTagOpen] = useState(false);
const [editOpen, setEditOpen] = useState(false);
const [analyticsOpen, setAnalyticsOpen] = useState(false);
const [guideOpen, setGuideOpen] = useState(false);
const [guidedModeOpen, setGuidedModeOpen] = useState(false);
const [guidedStep, setGuidedStep] = useState(1);
const [guidedBldChoice, setGuidedBldChoice] = useState("");

  const [editingId, setEditingId] = useState(null);

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
  const [photoCaption, setPhotoCaption] = useState("");

  const canSubmit = useMemo(() => specimenId.trim().length > 0, [specimenId]);
  const canQuickSave = useMemo(() => {
    return specimenId.trim().length > 0 && !!photoBlob && lat !== "" && lng !== "";
  }, [specimenId, photoBlob, lat, lng]);

  useEffect(() => {
    if (!isMobile) {
      setStatusOpen(true);
      return;
    }

    const mqLandscape = window.matchMedia?.("(orientation: landscape)");
    const apply = () => {
      const landscape = mqLandscape?.matches ?? (window.innerWidth > window.innerHeight);
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

  function getCoordsForRow(row) {
    const id = row?.specimen_id || row?.specimenId;

    if (id && geojson?.features?.length) {
      const f = geojson.features.find(
        (ff) => ff?.properties?.specimen_id === id || ff?.properties?.specimenId === id
      );
      const c = f?.geometry?.coordinates;
      if (Array.isArray(c) && c.length === 2) {
        return { lng: Number(c[0]), lat: Number(c[1]) };
      }
    }

    const latRaw = row?.lat ?? row?.latitude;
    const lngRaw = row?.lng ?? row?.longitude;

    let latVal = Number(latRaw);
    let lngVal = Number(lngRaw);

    if (!Number.isFinite(latVal) || !Number.isFinite(lngVal)) return null;

    const looksSwapped = Math.abs(latVal) > 60 && Math.abs(lngVal) <= 60;
    if (looksSwapped) {
      const tmp = latVal;
      latVal = lngVal;
      lngVal = tmp;
    }

    return { lng: lngVal, lat: latVal };
  }

  function bumpMapResize(times = 2) {
    const map = mapRef.current;
    if (!map) return;

    requestAnimationFrame(() => map.resize());
    if (times > 1) setTimeout(() => map.resize(), 180);
    if (times > 2) setTimeout(() => map.resize(), 420);
  }

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
      setGpsStatus("Location adjusted.");
    });

    draftMarkerRef.current = marker;
  }

  function resetDraftForm({ keepDrawer = false } = {}) {
    setEditingId(null);
    setSpecimenId("");
    setAdoptName("");
    setSpecies("Beech");
    setHealth("Healthy");
    setAgeClass("Unknown");
    setBldSigns("Unsure");
    setDbhIn("");
    setNotes("");
    setLat("");
    setLng("");
    setGpsStatus("");
    setPhotoBlob(null);
    setPhotoAvatar("");
    setPhotoStatus("");
    setPhotoCaption("");
    clearDraftMarker();

    if (!keepDrawer) {
      setAddOpen(false);
      setQuickTagOpen(false);
      setEditOpen(false);
    }
  }

  function populateFormFromSpecimen(row) {
    setEditingId(row.id || null);
    setSpecimenId(row.specimen_id || "");
    setAdoptName(row.adopted_name || "");
    setSpecies(row.species || "Beech");
    setHealth(row.health || "Healthy");
    setAgeClass(row.age_class || "Unknown");
    setBldSigns(row.bld_signs || "Unsure");
    setDbhIn(row.dbh_in == null ? "" : String(row.dbh_in));
    setNotes(row.notes || "");
    setObservedDate(row.observed_date || observedDate);
    setLat(row.lat == null ? "" : String(row.lat));
    setLng(row.lng == null ? "" : String(row.lng));
    setPhotoBlob(null);
    setPhotoAvatar("");
    setPhotoStatus("");
    setPhotoCaption("");

    if (row.lat != null && row.lng != null) {
      setDraftLocation(row.lat, row.lng);
    } else {
      clearDraftMarker();
    }
  }

  async function loadPhotosForSpecimen(specimenUuid) {
    if (!specimenUuid) {
      setSelectedPhotos([]);
      return [];
    }

    const { data, error } = await supabase
      .from("specimen_photos")
      .select("*")
      .eq("specimen_uuid", specimenUuid)
      .order("is_primary", { ascending: false })
      .order("observed_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    const rows = data || [];
    setSelectedPhotos(rows);
    return rows;
  }

  async function loadList() {
    const { data, error } = await supabase
      .from("specimens")
      .select(
        "id, specimen_id, species, health, dbh_in, notes, observed_date, created_at, lat, lng, adopted_name, age_class, bld_signs, updated_at"
      )
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

  async function loadAnalytics() {
    const { data, error } = await supabase.from("analytics_summary").select("data").single();
    if (error) throw error;
    setAnalytics(data?.data || null);
  }

  async function refreshAll() {
    setError("");
    try {
      await Promise.all([loadList(), loadGeoJSON()]);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function openSelectedSpecimen(row, coords = null) {
    setSelected(row);
    setSelectedLngLat(coords || getCoordsForRow(row));
    try {
      await loadPhotosForSpecimen(row?.id);
    } catch (e) {
      console.error(e);
      setSelectedPhotos([]);
    }
  }

  async function openEditSpecimen(row) {
    populateFormFromSpecimen(row);

    try {
      await loadPhotosForSpecimen(row?.id);
    } catch (e) {
      console.error(e);
      setSelectedPhotos([]);
    }

    setEditOpen(true);
    setAddOpen(false);
    setQuickTagOpen(false);
    setMenuOpen(false);
    setListOpen(false);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    if (analyticsOpen && !analytics) {
      loadAnalytics().catch((e) => setError(e?.message || String(e)));
    }
  }, [analyticsOpen, analytics]);

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

  useEffect(() => {
    bumpMapResize(3);
  }, [menuOpen, addOpen, listOpen, quickTagOpen, editOpen, analyticsOpen, isMobile]);

  async function handleUseGPS() {
    setGpsStatus("");
    if (!navigator.geolocation) {
      setGpsStatus("Geolocation not supported.");
      return;
    }

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
    if (!navigator.geolocation) {
      setGpsStatus("Geolocation not supported.");
      return;
    }

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

  async function attachPhotoToSpecimen(specimenUuid, specimenIdForFile, options = {}) {
    if (!photoBlob || !specimenUuid) return null;

    const photoUrl = await uploadPhotoToSupabaseStorage(specimenIdForFile);

    const { error } = await supabase.rpc("add_specimen_photo", {
      p_specimen_uuid: specimenUuid,
      p_photo_url: photoUrl,
      p_caption: options.caption || null,
      p_observed_date: options.observedDate || null,
      p_make_primary: !!options.makePrimary,
    });

    if (error) throw error;

    return photoUrl;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");

    const latNum = lat === "" ? null : Number(lat);
    const lngNum = lng === "" ? null : Number(lng);

    try {
      const { data, error } = await supabase.rpc("create_specimen", {
        p_specimen_id: specimenId.trim(),
        p_species: species.trim() || null,
        p_health: health || null,
        p_dbh_in: dbhIn === "" ? null : Number(dbhIn),
        p_notes: notes?.trim() || null,
        p_observed_date: observedDate || null,
        p_lat: latNum,
        p_lng: lngNum,
        p_adopted_name: adoptName?.trim() || null,
        p_age_class: ageClass || null,
        p_bld_signs: bldSigns || null,
      });

      if (error) {
        setError(error.message);
        return;
      }

      const createdId = data || null;

      if (photoBlob && createdId) {
        setPhotoStatus("Uploading photo…");
        await attachPhotoToSpecimen(createdId, specimenId.trim(), {
          caption: photoCaption?.trim() || null,
          observedDate: observedDate || null,
          makePrimary: true,
        });
        setPhotoStatus("Photo uploaded.");
      }

      resetDraftForm();
      await refreshAll();
      setAddOpen(false);
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    }
  }

  async function handleQuickPhotoTag(file) {
    if (!file) return;

    setError("");
    setPhotoStatus("");
    setQuickTagOpen(true);
    setAddOpen(false);
    setEditOpen(false);
    setMenuOpen(false);
    setListOpen(false);

    try {
      setPhotoStatus("Preparing quick tag…");

      await handlePickPhoto(file);

      if (!navigator.geolocation) {
        setError("Geolocation not supported in this browser.");
        return;
      }

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

      if (!specimenId.trim()) {
        setSpecimenId(makeAutoSpecimenId("BL"));
      }

      setSpecies("Beech");
      setPhotoStatus("Quick tag ready. You can drag the marker before saving.");
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    }
  }

  async function handleSaveQuickTag(e) {
    e.preventDefault();
    if (!canQuickSave) return;

    setError("");

    const latNum = Number(lat);
    const lngNum = Number(lng);

    try {
      const { data, error } = await supabase.rpc("create_specimen", {
        p_specimen_id: specimenId.trim(),
        p_species: species,
        p_health: null,
        p_dbh_in: null,
        p_notes: notes?.trim() || "Quick tag capture",
        p_observed_date: observedDate || null,
        p_lat: latNum,
        p_lng: lngNum,
        p_adopted_name: null,
        p_age_class: null,
        p_bld_signs: bldSigns || null,
      });
      if (error) {
        setError(error.message);
        return;
      }

      const createdId = data || null;

      if (photoBlob && createdId) {
        setPhotoStatus("Uploading photo…");
        await attachPhotoToSpecimen(createdId, specimenId.trim(), {
          caption: photoCaption?.trim() || "Quick tag capture",
          observedDate: observedDate || null,
          makePrimary: true,
        });
        setPhotoStatus("Photo uploaded.");
      }

      resetDraftForm();
      await refreshAll();
      setQuickTagOpen(false);
    } catch (e) {
      console.error(e);
      setError(e?.message || String(e));
    }
  }

  async function handleUpdateSpecimen(e) {
    e.preventDefault();
    if (!editingId) return;

    setError("");

    const latNum = lat === "" ? null : Number(lat);
    const lngNum = lng === "" ? null : Number(lng);

    try {
      const { error } = await supabase.rpc("update_specimen", {
        p_id: editingId,
        p_specimen_id: specimenId.trim() || null,
        p_species: species.trim() || null,
        p_health: health || null,
        p_dbh_in: dbhIn === "" ? null : Number(dbhIn),
        p_notes: notes,
        p_observed_date: observedDate || null,
        p_lat: latNum,
        p_lng: lngNum,
        p_adopted_name: adoptName?.trim() || null,
        p_age_class: ageClass || null,
        p_bld_signs: bldSigns || null,
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (photoBlob) {
        setPhotoStatus("Uploading photo…");
        await attachPhotoToSpecimen(editingId, specimenId.trim(), {
          caption: photoCaption?.trim() || null,
          observedDate: observedDate || null,
          makePrimary: selectedPhotos.length === 0,
        });
        setPhotoStatus("Photo uploaded.");
      }

      await refreshAll();

      const refreshedCoords =
        latNum != null && lngNum != null ? { lng: lngNum, lat: latNum } : null;

      const refreshedRow = {
        ...selected,
        id: editingId,
        specimen_id: specimenId.trim(),
        species,
        health,
        dbh_in: dbhIn === "" ? null : Number(dbhIn),
        notes,
        observed_date: observedDate,
        lat: latNum,
        lng: lngNum,
        adopted_name: adoptName,
        age_class: ageClass,
        bld_signs: bldSigns,
      };

      await openSelectedSpecimen(refreshedRow, refreshedCoords);
      resetDraftForm();
      setEditOpen(false);
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
      stroke: "#2a7466",
      fill: "rgba(42, 116, 102, 0.08)",
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

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: FIELD_STYLE,
      center: [-75.15, 40.28],
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
      setMapStatus("Map: WebGL reset");
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
      setMapStatus("Map: error");
    });

    const handleResize = () => map.resize();
    window.addEventListener("resize", handleResize);

    map.on("load", async () => {
      setMapStatus("Map: ready");

      if (!map.getSource("specimens")) {
        map.addSource("specimens", {
          type: "geojson",
          data: geojson,
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 12,
        });
      }

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

      if (!map.getLayer("specimens-clusters")) {
        map.addLayer({
          id: "specimens-clusters",
          type: "circle",
          source: "specimens",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "rgba(42, 116, 102, 0.08)",
            "circle-radius": ["step", ["get", "point_count"], 12, 12, 15, 30, 18],
            "circle-opacity": 1,
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "rgba(42, 116, 102, 0.32)",
          },
        });
      }

      if (!map.getLayer("specimens-icons")) {
        map.addLayer({
          id: "specimens-icons",
          type: "symbol",
          source: "specimens",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": "specimen-marker",
            "icon-anchor": "bottom",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.24, 12, 0.36, 16, 0.54],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: {
            "icon-opacity": 0.96,
          },
        });
      }

      map.on("click", async (e) => {
        const hitSpecimen = map.queryRenderedFeatures(e.point, { layers: ["specimens-icons"] });
        if (hitSpecimen && hitSpecimen.length) {
          const feature = hitSpecimen[0];
          const coords = feature.geometry?.coordinates;

          if (Array.isArray(coords) && coords.length === 2) {
            const featureLng = Number(coords[0]);
            const featureLat = Number(coords[1]);

            await openSelectedSpecimen(feature.properties || null, {
              lng: featureLng,
              lat: featureLat,
            });

            map.easeTo({ center: [featureLng, featureLat], zoom: Math.max(map.getZoom(), 15) });
          } else {
            await openSelectedSpecimen(feature.properties || null, null);
          }
          return;
        }

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

        const clickLng = e.lngLat.lng;
        const clickLat = e.lngLat.lat;
        setDraftLocation(clickLat, clickLng);
      });

      map.on("mouseenter", "specimens-icons", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "specimens-icons", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "specimens-clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "specimens-clusters", () => {
        map.getCanvas().style.cursor = "";
      });

      try {
        for (const overlay of OVERLAYS) {
          await ensureOverlayLoaded(map, overlay);
          setOverlayVisibility(map, overlay.key, !!overlayOn[overlay.key]);
        }

        if (overlayOn.bucks_boundary) {
          setTimeout(() => flyToOverlay(map, "bucks_boundary"), 250);
        }
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
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("specimens");
    if (!source) return;
    source.setData(geojson || { type: "FeatureCollection", features: [] });
  }, [geojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const overlay of OVERLAYS) {
      setOverlayVisibility(map, overlay.key, !!overlayOn[overlay.key]);
    }
  }, [overlayOn]);

  const ui = {
    shell: {
      position: "relative",
      width: "100%",
      height: "100dvh",
      overflow: "hidden",
      background: "var(--bl-bg)",
      color: "var(--bl-text)",
      fontFamily: "var(--font-body)",
    },

    mapStage: {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      background: "var(--bl-bg)",
    },

    mapRoot: {
      position: "absolute",
      inset: 0,
    },

    floatingHeader: {
      position: "absolute",
      top: 0,
      left: "max(0px, env(safe-area-inset-left))",
      right: "max(0px, env(safe-area-inset-right))",
      zIndex: 30,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 24,
      pointerEvents: "none",
      height: isMobile ? "58px" : "68px",
      padding: "max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) 0 max(18px, env(safe-area-inset-left))",
      background: "linear-gradient(to bottom, rgba(255,255,255,0.4), rgba(255,255,255,0.2), rgba(255,255,255,0.0))",
    },

    headerCard: {
      pointerEvents: "auto",
      display: "grid",
      gap: 10,
      width: isMobile ? "min(100%, 420px)" : "min(520px, 46vw)",
      background: "transparent",
    },

    title: {
      margin: 0,
      fontFamily: "var(--font-heading)",
      fontSize: isMobile ? 24 : 34,
      lineHeight: 1,
      letterSpacing: "-0.03em",
      color: "var(--bl-text)",
    },

    intro: {
      margin: 0,
      maxWidth: "58ch",
      fontFamily: "var(--font-body)",
      fontSize: isMobile ? 14 : 15,
      lineHeight: 1.5,
      color: "var(--bl-text-soft)",
    },

    headerActions: {
      pointerEvents: "auto",
      display: "flex",
      alignItems: "flex-start",
      gap: isMobile ? 12 : 16,
      flexWrap: "wrap",
      justifyContent: "flex-end",
      maxWidth: isMobile ? "68vw" : "unset",
      paddingTop: 2,
    },

    statusCard: {
      position: "absolute",
      left: "max(0px, env(safe-area-inset-left))",
      bottom: 0,
      right: "max(0px, env(safe-area-inset-right))",
      zIndex: 22,
      width: isMobile ? "min(calc(100vw - 36px), 360px)" : "min(420px, 30vw)",
      pointerEvents: "auto",
      padding: "10px max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left))",
      borderTop: "1px solid var(--bl-line-strong)",
      background: "linear-gradient(to top, rgba(255,255,255,0.4), rgba(255,255,255,0.2), rgba(255,255,255,0.0))",
      color: "var(--bl-text)",
      cursor: "pointer",
    },

    statusTitleRow: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      lineHeight: 1,
    },

    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: "var(--bl-bright)",
      flex: "0 0 auto",
    },

    statusTitle: {
      fontFamily: "var(--font-ui)",
      fontSize: 11,
      lineHeight: 1.2,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "var(--bl-text-soft)",
    },

    statusToggle: {
      marginLeft: "auto",
      fontFamily: "var(--font-ui)",
      fontSize: 11,
      lineHeight: 1.2,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--bl-text-faint)",
    },

    statusBody: {
      marginTop: 10,
      display: "grid",
      gap: 5,
      fontFamily: "var(--font-body)",
      fontSize: 13,
      lineHeight: 1.45,
      color: "var(--bl-text-soft)",
    },

    drawer: {
      position: "absolute",
      top: isMobile ? "58px" : "68px",
      right: "max(18px, env(safe-area-inset-right))",
      bottom: "max(18px, env(safe-area-inset-bottom))",
      zIndex: 26,
      width: isMobile ? "min(calc(100vw - 36px), 440px)" : "420px",
      maxWidth: "calc(100vw - 36px)",
      background: "rgba(243, 241, 232, 0.94)",
      borderLeft: "1px solid var(--bl-line)",
      paddingLeft: 18,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      pointerEvents: "auto",
    },

    drawerHeader: {
      display: "grid",
      gap: 10,
      padding: "2px 0 12px",
      borderBottom: "1px solid var(--bl-line)",
    },

    drawerTitleRow: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },

    drawerTitle: {
      margin: 0,
      fontFamily: "var(--font-heading-alt)",
      fontSize: 20,
      lineHeight: 1,
      letterSpacing: "-0.02em",
      color: "var(--bl-text)",
    },

    drawerClose: {
      fontFamily: "var(--font-ui)",
      fontSize: 11,
      lineHeight: 1.2,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--bl-text-soft)",
      borderBottom: "1px solid var(--bl-line-strong)",
      paddingBottom: 3,
      cursor: "pointer",
      background: "transparent",
    },

    drawerBody: {
      padding: "14px 0 0",
      overflowY: "auto",
      minHeight: 0,
      display: "grid",
      gap: 14,
    },

    button: (strong = false) => ({
      appearance: "none",
      WebkitAppearance: "none",
      border: "1px solid var(--bl-line)",
      background: strong ? "rgba(86, 199, 149, 0.10)" : "transparent",
      color: "var(--bl-text)",
      padding: "10px 12px",
      fontFamily: "var(--font-ui)",
      fontSize: 11,
      lineHeight: 1.2,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      cursor: "pointer",
    }),

    input: {
      width: "100%",
      border: "1px solid var(--bl-line)",
      background: "rgba(255,255,255,0.35)",
      color: "var(--bl-text)",
      padding: "11px 12px",
      fontFamily: "var(--font-ui)",
      fontSize: 13,
      lineHeight: 1.3,
      outline: "none",
    },

    textarea: {
      width: "100%",
      minHeight: 120,
      resize: "vertical",
      border: "1px solid var(--bl-line)",
      background: "rgba(255,255,255,0.35)",
      color: "var(--bl-text)",
      padding: "11px 12px",
      fontFamily: "var(--font-body)",
      fontSize: 14,
      lineHeight: 1.55,
      outline: "none",
    },

    label: {
      display: "grid",
      gap: 7,
      fontFamily: "var(--font-ui)",
      fontSize: 11,
      lineHeight: 1.2,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--bl-text-soft)",
    },

    helper: {
      fontFamily: "var(--font-body)",
      fontSize: 13,
      lineHeight: 1.45,
      color: "var(--bl-text-soft)",
    },

    overlayRow: {
      display: "grid",
      gridTemplateColumns: "14px 1fr auto",
      alignItems: "center",
      gap: 10,
      padding: "10px 0",
      borderBottom: "1px solid var(--bl-line)",
    },

    chip: (key) => ({
      width: 12,
      height: 12,
      borderRadius: 999,
      background: LAYER_STYLE[key]?.fill || "rgba(42,116,102,0.08)",
      border: `1px solid ${LAYER_STYLE[key]?.stroke || "#2a7466"}`,
    }),

    listRow: {
      textAlign: "left",
      background: "transparent",
      cursor: "pointer",
      display: "grid",
      gap: 4,
    },

    photoGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 8,
    },

    photoThumb: {
      width: "100%",
      aspectRatio: "1 / 1",
      objectFit: "cover",
      border: "1px solid var(--bl-line)",
      display: "block",
    },
  };

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
      color: var(--bl-text-faint);
    }

    .beechlens-map-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(42, 116, 102, 0.35) transparent;
    }

    .beechlens-map-scroll::-webkit-scrollbar {
      width: 10px;
    }

    .beechlens-map-scroll::-webkit-scrollbar-track {
      background: transparent;
    }

    .beechlens-map-scroll::-webkit-scrollbar-thumb {
      background: rgba(42, 116, 102, 0.24);
      border-radius: 999px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }

    .beechlens-drawer-enter {
      animation: beechlensDrawerIn 180ms ease-out;
    }

    .beechlens-check {
      accent-color: #2a7466;
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .beechlens-select {
      appearance: none;
      -webkit-appearance: none;
      background-image:
        linear-gradient(45deg, transparent 50%, var(--bl-text-soft) 50%),
        linear-gradient(135deg, var(--bl-text-soft) 50%, transparent 50%);
      background-position:
        calc(100% - 18px) calc(50% - 2px),
        calc(100% - 12px) calc(50% - 2px);
      background-size: 6px 6px, 6px 6px;
      background-repeat: no-repeat;
      padding-right: 34px !important;
    }

    @keyframes beechlensDrawerIn {
      from {
        opacity: 0;
        transform: translateY(8px) translateX(8px);
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
        gap: 18px;
      }

      .beechlens-header-actions {
        justify-content: flex-start;
        max-width: none;
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
          <h1 style={ui.title}>BeechLens</h1>
          <p style={ui.intro}>
            A minimal spatial field for noticing, tracking, and caring for beech trees across parks,
            forests, and local landscapes.
          </p>
        </div>

        <div className="beechlens-header-actions" style={ui.headerActions}>
          <RuleButton
            label="Layers"
            active={menuOpen}
            onClick={() => {
              setMenuOpen((v) => !v);
              setAddOpen(false);
              setListOpen(false);
              setQuickTagOpen(false);
              setEditOpen(false);
            }}
          />

          <RuleButton
            label="Quick tag"
            active={quickTagOpen}
            onClick={() => {
              setQuickTagOpen((v) => !v);
              setMenuOpen(false);
              setAddOpen(false);
              setListOpen(false);
              setEditOpen(false);
              if (!specimenId.trim()) setSpecimenId(makeAutoSpecimenId("BL"));
            }}
          />

          <RuleButton
            label="Add specimen"
            active={addOpen}
            onClick={() => {
              resetDraftForm({ keepDrawer: true });
              setAddOpen((v) => !v);
              setMenuOpen(false);
              setListOpen(false);
              setQuickTagOpen(false);
              setEditOpen(false);
            }}
          />

          <RuleButton
            label="Specimens"
            active={listOpen}
            onClick={() => {
              setListOpen((v) => !v);
              setMenuOpen(false);
              setAddOpen(false);
              setQuickTagOpen(false);
              setEditOpen(false);
              setAnalyticsOpen(false);
            }}
          />

          <RuleButton
            label="Analytics"
            active={analyticsOpen}
            onClick={() => {
              setAnalyticsOpen((v) => !v);
              setMenuOpen(false);
              setAddOpen(false);
              setListOpen(false);
              setQuickTagOpen(false);
              setEditOpen(false);
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setStatusOpen((v) => !v)}
        style={ui.statusCard}
        aria-expanded={statusOpen}
        aria-label="Toggle field status"
      >
        <div style={ui.statusTitleRow}>
          <div style={ui.statusDot} />
          <div style={ui.statusTitle}>Field status</div>
          <div style={ui.statusToggle}>{statusOpen ? "Hide" : "Show"}</div>
        </div>

        {statusOpen ? (
          <div style={ui.statusBody}>
            <div>{mapStatus}</div>
            <div>{geojson?.features?.length || 0} mapped specimens loaded</div>
            <div>{Object.values(overlayOn).filter(Boolean).length} overlay layers visible</div>
            {error ? <div style={{ color: "var(--bl-ochre)" }}>{error}</div> : null}
          </div>
        ) : null}
      </button>

      {menuOpen ? (
        <section className="beechlens-drawer-enter" style={ui.drawer}>
          <div style={ui.drawerHeader}>
            <div style={ui.drawerTitleRow}>
              <h2 style={ui.drawerTitle}>Visible layers</h2>
              <button type="button" style={ui.drawerClose} onClick={() => setMenuOpen(false)}>
                Close
              </button>
            </div>
            <div style={ui.helper}>
              Toggle geographic context so the field stays quiet and the specimens remain primary.
            </div>
          </div>

          <div className="beechlens-map-scroll" style={ui.drawerBody}>
            {OVERLAYS.map((overlay) => (
              <label key={overlay.key} style={ui.overlayRow}>
                <span style={ui.chip(overlay.key)} />
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    lineHeight: 1.35,
                    color: "var(--bl-text)",
                  }}
                >
                  {overlay.label}
                </span>
                <input
                  className="beechlens-check"
                  type="checkbox"
                  checked={!!overlayOn[overlay.key]}
                  onChange={() => toggleOverlay(overlay.key)}
                />
              </label>
            ))}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 8 }}>
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

      {quickTagOpen ? (
        <section className="beechlens-drawer-enter" style={ui.drawer}>
          <div style={ui.drawerHeader}>
            <div style={ui.drawerTitleRow}>
              <h2 style={ui.drawerTitle}>Quick tag</h2>
              <button type="button" style={ui.drawerClose} onClick={() => setQuickTagOpen(false)}>
                Close
              </button>
            </div>
            <div style={ui.helper}>
              Capture a geolocated photo quickly in the field. The marker can be dragged before saving
              if the tree is a little away from where the photo was taken.
            </div>
            <div style={{ paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={ui.button(false)}
                onClick={() => setGuidedModeOpen((prev) => {
                  if (!prev) {
                    setGuidedStep(1);
                    setGuidedBldChoice("");
                  }
                  return !prev;
                })}
              >
                Guided mode
              </button>
              <button type="button" style={ui.button(false)} onClick={() => setGuideOpen(!guideOpen)}>
                Quick guide
              </button>
            </div>
          </div>

          <form className="beechlens-map-scroll" style={ui.drawerBody} onSubmit={handleSaveQuickTag}>
            {guidedModeOpen ? (
              <div style={{ paddingBottom: 16, borderBottom: "1px solid var(--bl-line)", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <h3 style={{ fontFamily: "var(--font-heading-alt)", fontSize: 18, lineHeight: 1, margin: 0 }}>Guided mode</h3>
                  <button type="button" style={ui.button(false)} onClick={() => setGuidedModeOpen(false)}>
                    Close
                  </button>
                </div>
                {guidedStep === 1 ? (
                  <div style={{ marginTop: 14 }}>
                    <h4 style={{ fontFamily: "var(--font-heading-alt)", fontSize: 16, lineHeight: 1, margin: "0 0 8px 0" }}>Is this a beech?</h4>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      {[
                        "smooth gray bark",
                        "pointed buds",
                        "oval leaves with straight side veins",
                      ].map((cue) => (
                        <span key={cue} style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, border: "1px solid var(--bl-line)", background: "var(--bl-surface)", fontSize: 12 }}>
                          {cue}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      {GUIDE_SECTIONS[0].imagePaths?.map((src, k) => (
                        <div key={k} style={{ flex: "1 1 120px", minWidth: 120, aspectRatio: "4 / 3", overflow: "hidden", borderRadius: 4, border: "1px solid var(--bl-line)", background: "var(--bl-line)" }}>
                          <img
                            src={src}
                            alt="Beech tree guide image"
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" style={ui.button(false)} onClick={() => {
                        setSpecies("Beech");
                        setGuidedStep(2);
                      }}>
                        Looks like beech
                      </button>
                      <button type="button" style={ui.button(false)} onClick={() => setGuidedStep(2)}>
                        Not sure
                      </button>
                    </div>
                  </div>
                ) : guidedStep === 2 ? (
                  <div style={{ marginTop: 14 }}>
                    <h4 style={{ fontFamily: "var(--font-heading-alt)", fontSize: 16, lineHeight: 1, margin: "0 0 8px 0" }}>Any signs of beech leaf disease?</h4>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      {[...GUIDE_SECTIONS[1].imagePaths, ...GUIDE_SECTIONS[2].imagePaths].map((src, k) => (
                        <div key={k} style={{ flex: "1 1 120px", minWidth: 120, aspectRatio: "4 / 3", overflow: "hidden", borderRadius: 4, border: "1px solid var(--bl-line)", background: "var(--bl-line)" }}>
                          <img
                            src={src}
                            alt="Beech leaf disease guide image"
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                      {[
                        { label: "No visible signs", value: "No" },
                        { label: "Possible early signs", value: "Unsure" },
                        { label: "Clear signs", value: "Yes" },
                        { label: "Unsure", value: "Unsure" },
                      ].map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          style={ui.button(false)}
                          onClick={() => {
                            setSpecies("Beech");
                            setGuidedBldChoice(option.value);
                            setBldSigns(option.value);
                            setGuidedStep(3);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 14 }}>
                    <h4 style={{ fontFamily: "var(--font-heading-alt)", fontSize: 16, lineHeight: 1, margin: "0 0 8px 0" }}>Quick tag ready</h4>
                    <div style={{ ...ui.helper, marginBottom: 12 }}>
                      Species set to Beech. BLD signs set to {guidedBldChoice || "Unsure"}. The normal quick-tag controls are shown below.
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" style={ui.button(false)} onClick={() => setGuidedModeOpen(false)}>
                        Continue
                      </button>
                      <button type="button" style={ui.button(false)} onClick={() => {
                        setGuidedStep(1);
                        setGuidedBldChoice("");
                      }}>
                        Restart guided mode
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {guideOpen ? (
              <div style={{ paddingBottom: 16, borderBottom: "1px solid var(--bl-line)", marginBottom: 16 }}>
                <h3 style={{ fontFamily: "var(--font-heading-alt)", fontSize: 18, lineHeight: 1, margin: 0 }}>Quick Guide</h3>
                {GUIDE_SECTIONS.map((section, i) => (
                  <div key={i} style={{ marginTop: 16 }}>
                    <h4 style={{ fontFamily: "var(--font-heading-alt)", fontSize: 16, lineHeight: 1, margin: "0 0 8px 0" }}>{section.title}</h4>
                    <p style={{ ...ui.helper, margin: "0 0 8px 0" }}>{section.description}</p>
                    <ul style={{ ...ui.helper, margin: 0, paddingLeft: 18 }}>
                      {section.bullets.map((bullet, j) => <li key={j}>{bullet}</li>)}
                    </ul>
                    <a href={section.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ ...ui.helper, color: "var(--bl-text)", textDecoration: "underline", display: "block", marginTop: 8 }}>
                      {section.sourceLabel}
                    </a>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      {section.imagePaths?.map((src, k) => {
                        const altText = section.title === "Identify a beech tree"
                          ? "beech tree identification photo"
                          : section.title === "Early beech leaf disease"
                          ? "early beech leaf disease photo"
                          : "advanced beech decline or comparison photo";

                        return (
                          <div key={k} style={{ flex: "1 1 120px", minWidth: 120, aspectRatio: "4 / 3", overflow: "hidden", borderRadius: 4, border: "1px solid var(--bl-line)", background: "var(--bl-line)" }}>
                            <img
                              src={src}
                              alt={altText}
                              loading="lazy"
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button type="button" style={ui.button(false)} onClick={() => setGuideOpen(false)}>Close</button>
              </div>
            ) : null}

            <label style={ui.label}>
              Photo
              <input
                style={ui.input}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleQuickPhotoTag(e.target.files?.[0] || null)}
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
                    border: "1px solid var(--bl-line)",
                  }}
                />
                <div style={ui.helper}>{photoStatus || "Photo attached"}</div>
              </div>
            ) : photoStatus ? (
              <div style={ui.helper}>{photoStatus}</div>
            ) : null}

            <label style={ui.label}>
              Specimen ID
              <input
                style={ui.input}
                value={specimenId}
                onChange={(e) => setSpecimenId(e.target.value)}
                placeholder="Auto-generated or custom"
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={ui.label}>
                Latitude
                <input
                  style={ui.input}
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="Required"
                />
              </label>

              <label style={ui.label}>
                Longitude
                <input
                  style={ui.input}
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="Required"
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
              Observed date
              <input
                style={ui.input}
                type="date"
                value={observedDate}
                onChange={(e) => setObservedDate(e.target.value)}
              />
            </label>

            <label style={ui.label}>
              Photo caption
              <input
                style={ui.input}
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="Optional"
              />
            </label>

            <label style={ui.label}>
              Field note
              <textarea
                style={ui.textarea}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note for this quick observation..."
              />
            </label>

            <div style={{ display: "flex", gap: 10, paddingTop: 4, flexWrap: "wrap" }}>
              <button type="submit" style={ui.button(true)} disabled={!canQuickSave}>
                Save quick tag
              </button>
              <button
                type="button"
                style={ui.button(false)}
                onClick={() => {
                  resetDraftForm();
                  setQuickTagOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {addOpen ? (
        <section className="beechlens-drawer-enter" style={ui.drawer}>
          <div style={ui.drawerHeader}>
            <div style={ui.drawerTitleRow}>
              <h2 style={ui.drawerTitle}>Add a specimen</h2>
              <button type="button" style={ui.drawerClose} onClick={() => setAddOpen(false)}>
                Close
              </button>
            </div>
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
              <input style={ui.input} value={species} onChange={(e) => setSpecies(e.target.value)} />
            </label>

            <label style={ui.label}>
              Health
              <select
                className="beechlens-select"
                style={ui.input}
                value={health}
                onChange={(e) => setHealth(e.target.value)}
              >
                {HEALTH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label style={ui.label}>
              Age class
              <select
                className="beechlens-select"
                style={ui.input}
                value={ageClass}
                onChange={(e) => setAgeClass(e.target.value)}
              >
                {AGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label style={ui.label}>
              Beech leaf disease signs
              <select
                className="beechlens-select"
                style={ui.input}
                value={bldSigns}
                onChange={(e) => setBldSigns(e.target.value)}
              >
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

            <label style={ui.label}>
              Photo caption
              <input
                style={ui.input}
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="Optional"
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
                    border: "1px solid var(--bl-line)",
                  }}
                />
                <div style={ui.helper}>{photoStatus || "Photo attached"}</div>
              </div>
            ) : photoStatus ? (
              <div style={ui.helper}>{photoStatus}</div>
            ) : null}

            <div style={{ display: "flex", gap: 10, paddingTop: 4, flexWrap: "wrap" }}>
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

      {editOpen ? (
        <section className="beechlens-drawer-enter" style={ui.drawer}>
          <div style={ui.drawerHeader}>
            <div style={ui.drawerTitleRow}>
              <h2 style={ui.drawerTitle}>Edit specimen</h2>
              <button type="button" style={ui.drawerClose} onClick={() => setEditOpen(false)}>
                Close
              </button>
            </div>
            <div style={ui.helper}>
              Update the specimen record and append new photos over time to document progression.
            </div>
          </div>

          <form className="beechlens-map-scroll" style={ui.drawerBody} onSubmit={handleUpdateSpecimen}>
            <label style={ui.label}>
              Specimen ID
              <input
                style={ui.input}
                value={specimenId}
                onChange={(e) => setSpecimenId(e.target.value)}
              />
            </label>

            <label style={ui.label}>
              Adopted name
              <input
                style={ui.input}
                value={adoptName}
                onChange={(e) => setAdoptName(e.target.value)}
              />
            </label>

            <label style={ui.label}>
              Species
              <input style={ui.input} value={species} onChange={(e) => setSpecies(e.target.value)} />
            </label>

            <label style={ui.label}>
              Health
              <select
                className="beechlens-select"
                style={ui.input}
                value={health}
                onChange={(e) => setHealth(e.target.value)}
              >
                {HEALTH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label style={ui.label}>
              Age class
              <select
                className="beechlens-select"
                style={ui.input}
                value={ageClass}
                onChange={(e) => setAgeClass(e.target.value)}
              >
                {AGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label style={ui.label}>
              Beech leaf disease signs
              <select
                className="beechlens-select"
                style={ui.input}
                value={bldSigns}
                onChange={(e) => setBldSigns(e.target.value)}
              >
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
                />
              </label>

              <label style={ui.label}>
                Longitude
                <input
                  style={ui.input}
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
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
              />
            </label>

            <div style={{ display: "grid", gap: 8, paddingTop: 6 }}>
              <div style={ui.label}>Existing photos</div>
              {selectedPhotos.length === 0 ? (
                <div style={ui.helper}>No photos attached yet.</div>
              ) : (
                <div style={ui.photoGrid}>
                  {selectedPhotos.map((photo) => (
                    <img
                      key={photo.id}
                      src={photo.photo_url}
                      alt=""
                      style={ui.photoThumb}
                    />
                  ))}
                </div>
              )}
            </div>

            <label style={ui.label}>
              Add new photo
              <input
                style={ui.input}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handlePickPhoto(e.target.files?.[0] || null)}
              />
            </label>

            <label style={ui.label}>
              New photo caption
              <input
                style={ui.input}
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                placeholder="Optional"
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
                    border: "1px solid var(--bl-line)",
                  }}
                />
                <div style={ui.helper}>{photoStatus || "New photo ready to append"}</div>
              </div>
            ) : photoStatus ? (
              <div style={ui.helper}>{photoStatus}</div>
            ) : null}

            <div style={{ display: "flex", gap: 10, paddingTop: 4, flexWrap: "wrap" }}>
              <button type="submit" style={ui.button(true)}>
                Save changes
              </button>
              <button type="button" style={ui.button(false)} onClick={() => setEditOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {listOpen ? (
        <section className="beechlens-drawer-enter" style={ui.drawer}>
          <div style={ui.drawerHeader}>
            <div style={ui.drawerTitleRow}>
              <h2 style={ui.drawerTitle}>Recent specimens</h2>
              <button type="button" style={ui.drawerClose} onClick={() => setListOpen(false)}>
                Close
              </button>
            </div>
            <div style={ui.helper}>Select a specimen to fly to its mapped location.</div>
          </div>

          <div className="beechlens-map-scroll" style={ui.drawerBody}>
            {specimenList.length === 0 ? (
              <div style={ui.helper}>No specimens loaded yet.</div>
            ) : (
              specimenList.map((row) => (
                <div
                  key={row.id}
                  style={{
                    borderTop: "1px solid var(--bl-line)",
                    padding: "12px 0",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      flyToSpecimenFromRow(row);
                      await openSelectedSpecimen(row);
                    }}
                    style={ui.listRow}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-heading-alt)",
                        fontSize: 20,
                        lineHeight: 0.96,
                        letterSpacing: "-0.02em",
                        color: "var(--bl-text)",
                      }}
                    >
                      {row.specimen_id || "Untitled specimen"}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-ui)",
                        fontSize: 11,
                        lineHeight: 1.35,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--bl-text-soft)",
                      }}
                    >
                      {row.species || "Unknown species"} · {row.health || "Unknown health"}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 13,
                        lineHeight: 1.4,
                        color: "var(--bl-text-faint)",
                      }}
                    >
                      {row.observed_date || "No observation date"}
                    </div>
                  </button>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={ui.button(false)}
                      onClick={() => openEditSpecimen(row)}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {analyticsOpen ? (
        <section className="beechlens-drawer-enter" style={ui.drawer}>
          <div style={ui.drawerHeader}>
            <div style={ui.drawerTitleRow}>
              <h2 style={ui.drawerTitle}>Analytics</h2>
              <button type="button" style={ui.drawerClose} onClick={() => setAnalyticsOpen(false)}>
                Close
              </button>
            </div>
            <div style={ui.helper}>
              Overview of field activity and specimen data.
            </div>
          </div>

          <div className="beechlens-map-scroll" style={ui.drawerBody}>
            {analytics ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <StatCard label="Total specimens" value={analytics.totals?.total_specimens || 0} />
                  <StatCard label="Total photos" value={analytics.totals?.total_photos || 0} />
                  <StatCard label="Geolocated specimens" value={analytics.totals?.geolocated_specimens || 0} />
                  <StatCard label="BLD yes specimens" value={analytics.totals?.bld_yes_specimens || 0} />
                </div>

                <div style={{ display: "grid", gap: 24, paddingTop: 12 }}>
                  <div>
                    <div style={ui.label}>Specimens over time</div>
                    <TinyLineChart data={analytics.specimens_over_time || []} />
                  </div>

                  <div>
                    <div style={ui.label}>Photos over time</div>
                    <TinyLineChart data={analytics.photos_over_time || []} />
                  </div>

                  <div>
                    <div style={ui.label}>Health breakdown</div>
                    <HorizontalBreakdown data={analytics.health_breakdown || []} />
                  </div>

                  <div>
                    <div style={ui.label}>BLD breakdown</div>
                    <HorizontalBreakdown data={analytics.bld_breakdown || []} />
                  </div>

                  <div>
                    <div style={ui.label}>Age breakdown</div>
                    <HorizontalBreakdown data={analytics.age_breakdown || []} />
                  </div>

                  <div>
                    <div style={ui.label}>Top tagging days</div>
                    {analytics.top_tagging_days?.length ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {analytics.top_tagging_days.map((day) => (
                          <div key={day.day} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--bl-text)" }}>{day.day}</span>
                            <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--bl-text-soft)" }}>{day.count} tags</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={ui.helper}>No data yet.</div>
                    )}
                  </div>

                  <div>
                    <div style={ui.label}>Recent specimens</div>
                    {analytics.recent_specimens?.length ? (
                      <div style={{ display: "grid", gap: 16 }}>
                        {analytics.recent_specimens.map((spec) => (
                          <div key={spec.id} style={{ borderTop: "1px solid var(--bl-line)", paddingTop: 12 }}>
                            <div style={{ fontFamily: "var(--font-heading-alt)", fontSize: 16, color: "var(--bl-text)", marginBottom: 4 }}>
                              {spec.specimen_id}
                            </div>
                            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--bl-text-soft)", marginBottom: 2 }}>
                              {spec.species || "Unknown"} · {spec.health || "Unknown"}
                            </div>
                            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--bl-text-faint)" }}>
                              {spec.observed_date || "No date"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={ui.helper}>No specimens yet.</div>
                    )}
                  </div>

                  {analytics.recent_photos?.length ? (
                    <div>
                      <div style={ui.label}>Recent photos</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: 8 }}>
                        {analytics.recent_photos.map((photo) => (
                          <img
                            key={photo.id}
                            src={photo.photo_url}
                            alt={photo.caption || ""}
                            style={{
                              width: "100%",
                              aspectRatio: "1 / 1",
                              objectFit: "cover",
                              border: "1px solid var(--bl-line)",
                              borderRadius: 4,
                              display: "block",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div style={ui.helper}>Loading analytics…</div>
            )}
          </div>
        </section>
      ) : null}

      {selected && selectedLngLat ? (
        <SelectedSpecimenPopup
          mapRef={mapRef}
          selected={selected}
          selectedPhotos={selectedPhotos}
          lngLat={selectedLngLat}
          onClose={() => {
            setSelected(null);
            setSelectedLngLat(null);
            setSelectedPhotos([]);
          }}
          onEdit={() => openEditSpecimen(selected?.properties || selected)}
        />
      ) : null}
    </div>
  );
}