import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { supabase } from "./lib/supabase";

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

// deterministic "random" for stable layout (same result every refresh)
function hash2D(x, y) {
  // simple integer hash
  let n = x * 374761393 + y * 668265263; // primes
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
function TreePatternOverlay({
  cell = 90,
  opacity = 0.14,
  zIndex = 1,
}) {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cols = Math.ceil(size.w / cell);
  const rows = Math.ceil(size.h / cell);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex,
        opacity,
        mixBlendMode: "normal",
      }}
    >
      {/* grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
          gridTemplateRows: `repeat(${rows}, ${cell}px)`,
        }}
      >
        {Array.from({ length: cols * rows }).map((_, i) => {
          const x = i % cols;
          const y = Math.floor(i / cols);

          // pick which SVG to use for this cell
          const pick = hash2D(x, y) % TREE_SVGS.length;
          const src = TREE_SVGS[pick];

          // subtle variation: size + rotation + offset (still deterministic)
          const r = hash2D(x + 11, y + 37);
          const scale = 0.6 + (r % 60) / 100; // 0.72–1.01
          const rot = (0) - 0; // -10..+10 deg
          const dx = ((hash2D(x + 3, y + 5) % 11) - 5) * 1.2; // px
          const dy = ((hash2D(x + 6, y + 9) % 11) - 5) * 1.2;

          return (
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
                src={src}
                alt=""
                style={{
                  width: 38,
                  height: 38,
                  transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${scale})`,
                  opacity: 0.65,
                  filter: "grayscale(1) brightness(.2)",
                }}
              />
            </div>
          );
        })}
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

// --- simple image compression (client-side, zero-cost) ---
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

        // crop to square
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        // circle clip
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

export default function App() {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const draftMarkerRef = useRef(null);

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

  // UI state
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

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

  // Photo state
  const [photoFile, setPhotoFile] = useState(null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [photoAvatar, setPhotoAvatar] = useState(""); // data URL preview
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
      .select("id, specimen_id, species, health, dbh_in, observed_date, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    setSpecimenList(data || []);
  }

  async function loadGeoJSON() {
    const { data, error } = await supabase.rpc("specimens_geojson");
    if (error) throw error;

    const fc =
      data && data.type === "FeatureCollection"
        ? data
        : { type: "FeatureCollection", features: [] };

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
    setPhotoFile(file || null);
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

    // bucket name (create in Supabase UI)
    const bucket = "specimen-photos";

    const filename = `${specimenIdForFile}-${Date.now()}.jpg`;
    const path = `${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, photoBlob, { contentType: "image/jpeg", upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");

    const latNum = lat === "" ? null : Number(lat);
    const lngNum = lng === "" ? null : Number(lng);

    try {
      // Upload photo first (optional)
      let photoUrl = null;
      if (photoBlob) {
        setPhotoStatus("Uploading photo…");
        photoUrl = await uploadPhotoToSupabaseStorage(specimenId.trim());
        setPhotoStatus(photoUrl ? "Photo uploaded." : "");
      }

      // Save specimen record
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

      if (error) {
        setError(error.message);
        return;
      }

      // Reset form
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

      setPhotoFile(null);
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

  function toggleOverlay(key) {
    setOverlayOn((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleFlyToBucks() {
    const map = mapRef.current;
    if (!map) return;
    if (!overlayData.bucks_boundary) return;
    flyToOverlay(map, "bucks_boundary");
  }

  // Quick tag: take photo + use GPS + create specimen
  async function handleQuickPhotoTag(file) {
    if (!file) return;

    setError("");
    setPhotoStatus("");

    try {
      setPhotoStatus("Preparing quick tag…");

      // compress + avatar preview
      await handlePickPhoto(file);

      // get GPS
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

      // auto generate an ID
      const autoId = `PHOTO-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 1000)}`;
      setSpecimenId(autoId);
      setAddOpen(true);
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

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("error", (e) => {
      console.error("MapLibre error:", e?.error || e);
      setMapStatus("Map: error (check console)");
    });

    const handleResize = () => map.resize();
    window.addEventListener("resize", handleResize);

    map.on("load", async () => {
      setMapStatus("Map: ready");

      map.addSource("specimens", {
        type: "geojson",
        data: geojson,
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 12,
      });

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

      map.addLayer({
        id: "specimens-points",
        type: "circle",
        source: "specimens",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "rgba(255,255,255,0.95)",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(5,8,13,0.65)",
          "circle-opacity": 0.95,
        },
      });

      // click map -> set draft marker
      map.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        setDraftLocation(lat, lng);
      });

      // click specimen -> select
      map.on("click", "specimens-points", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        setSelected(feature.properties || null);

        const coords = feature.geometry?.coordinates;
        if (coords?.length === 2) {
          map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 14) });
        }
      });

      // click cluster -> zoom
      map.on("click", "specimens-clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["specimens-clusters"] });
        const clusterId = features?.[0]?.properties?.cluster_id;
        if (clusterId == null) return;

        const source = map.getSource("specimens");
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: features[0].geometry.coordinates, zoom });
        });
      });

      map.on("mouseenter", "specimens-points", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "specimens-points", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "specimens-clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "specimens-clusters", () => (map.getCanvas().style.cursor = ""));

      // overlays
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
    for (const overlay of OVERLAYS) {
      setOverlayVisibility(map, overlay.key, !!overlayOn[overlay.key]);
    }
  }, [overlayOn]);
  const ui = {
    bg: {
      height: "100vh",
      width: "100vw",
      display: "grid",
      placeItems: "center",
      position: "relative",
      overflow: "hidden",
     background:
  "radial-gradient(1200px 800px at 18% 12%, rgba(134, 239, 172, 0.18) 0%, rgba(11, 16, 18, 0) 55%), \
   radial-gradient(900px 700px at 88% 8%, rgba(45, 212, 191, 0.14) 0%, rgba(11, 16, 18, 0) 58%), \
   radial-gradient(900px 800px at 60% 110%, rgba(163, 230, 53, 0.08) 0%, rgba(11, 16, 18, 0) 60%), \
   linear-gradient(180deg, #070B0E 0%, #0B1415 55%, #070B0E 100%)",

      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial',
    },
  pixelOverlay: {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  opacity: 0.14,
  mixBlendMode: "normal",
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2780%27 height=%2780%27 viewBox=%270 0 80 80%27%3E%3Cg fill=%27none%27 stroke=%27rgba(255,255,255,0.22)%27 stroke-width=%271.2%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M40 16c9 0 16 7 16 16c0 6-3 10-7 13c-3 2-6 2-9 2s-6 0-9-2c-4-3-7-7-7-13c0-9 7-16 16-16z%27/%3E%3Cpath d=%27M40 47v16%27/%3E%3Cpath d=%27M36 63h8%27/%3E%3Cpath d=%27M40 50c-2 2-4 3-6 4%27/%3E%3Cpath d=%27M40 50c2 2 4 3 6 4%27/%3E%3C/g%3E%3C/svg%3E")',
  backgroundRepeat: "repeat",
  backgroundSize: "90px 90px",
  zIndex: 1,
},



    title: {
      position: "absolute",
      top: 22,
      left: 22,
      fontSize: 60,
      fontWeight: 850,
      letterSpacing: -0.8,
      color: "rgba(255,255,255,0.94)",
      textShadow: "0 18px 60px rgba(0,0,0,0.55)",
      userSelect: "none",
      fontFamily:
  '"BeechDisplay", ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Helvetica, Arial',

    },
    topRight: {
      position: "absolute",
      top: 18,
      right: 18,
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
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
  lineHeight: 1,
  fontSize: 20,
  padding: 0,
  userSelect: "none",
},

   insetFrame: {
  width: "min(1180px, calc(100vw - 48px))",
  height: "min(720px, calc(100vh - 120px))",
  borderRadius: 28,
  overflow: "hidden",
  position: "relative",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 35px 120px rgba(0,0,0,0.55)",
  background: "rgba(0,0,0,0.2)",
  zIndex: 2, // ✅ add
},

    map: {
      position: "absolute",
      inset: 0,
    },
    statusPill: {
      position: "absolute",
      bottom: 16,
      left: 16,
      padding: "10px 12px",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(10,14,22,0.62)",
      color: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(10px)",
      fontSize: 12,
      zIndex: 10,
      maxWidth: 420,
    },
    dropdown: {
      position: "absolute",
      top: 74,
      right: 18,
      width: 320,
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
      position: "absolute",
      top: 90,
      right: 18,
      width: 420,
      maxWidth: "calc(100vw - 36px)",
      maxHeight: "calc(100vh - 120px)",
      overflow: "auto",
      borderRadius: 20,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(10,14,22,0.78)",
      backdropFilter: "blur(12px)",
      boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
      padding: 14,
      zIndex: 70,
      color: "rgba(255,255,255,0.92)",
    },
    h2: { margin: "6px 0 10px", fontSize: 13, opacity: 0.88, letterSpacing: 0.3 },
    row: { display: "grid", gap: 10 },
    label: { fontSize: 12, opacity: 0.72 },
    input: {
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
    },
    button: (primary) => ({
      padding: "10px 12px",
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
      padding: "10px 12px",
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
  };

  return (
    <div style={ui.bg}>
      <TreePatternOverlay cell={92} opacity={0.8} zIndex={1} />


      <div style={ui.title}>BeechLens</div>

      {/* Top-right floating controls */}
      <div style={ui.topRight}>
        {/* Hamburger -> layers dropdown */}
        <button
          style={ui.iconBtn}
          onClick={() => {
            setMenuOpen((v) => !v);
            setAddOpen(false);
          }}
          title="Layers"
          aria-label="Layers"
        >
          ☰
        </button>

        {/* Photo quick-tag */}
        <label style={{ ...ui.iconBtn, cursor: "pointer" }} title="Quick tag from photo">
          📷
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => handleQuickPhotoTag(e.target.files?.[0] || null)}
          />
        </label>

        {/* Plus -> add specimen drawer */}
        <button
          style={ui.iconBtn}
          onClick={() => {
            setAddOpen((v) => !v);
            setMenuOpen(false);
          }}
          title="Add specimen"
          aria-label="Add specimen"
        >
          ＋
        </button>
      </div>

      {/* Map inset frame */}
      <div style={ui.insetFrame}>
        <div ref={mapContainerRef} style={ui.map} />

        <div style={ui.statusPill}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Map</div>
          <div style={{ opacity: 0.85 }}>{mapStatus}</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Click map to set location • drag marker • points = specimens
          </div>
        </div>
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
                style={{ ...ui.input, minHeight: 84, resize: "vertical" }}
              />
            </div>

            {/* Photo */}
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

            {/* Location controls */}
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
