import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { supabase } from "./lib/supabase";

const HEALTH_OPTIONS = ["Healthy", "Stressed", "Declining", "Dead"];

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


// ---- Overlay config ----
const OVERLAYS = [
  { key: "bucks_boundary", label: "Bucks County Boundary", url: "/overlays/bucks_boundary.geojson" },
  { key: "state_forests", label: "State Forests", url: "/overlays/state_forests.geojson" },
  { key: "state_parks", label: "State Parks", url: "/overlays/state_parks.geojson" },
  { key: "bucks_parks", label: "Bucks County Parks", url: "/overlays/bucks_parks.geojson" },
];

// ---- Branded layer style tokens ----
const LAYER_STYLE = {
  bucks_boundary: {
    chip: "rgba(212, 245, 220, 0.14)",
    stroke: "rgba(212, 245, 220, 0.90)", // pale mint
    fill: "rgba(212, 245, 220, 0.08)",
    lineWidth: 4,
  },
  state_forests: {
    chip: "rgba(34, 197, 94, 0.16)",
    stroke: "rgba(34, 197, 94, 0.90)", // emerald
    fill: "rgba(34, 197, 94, 0.20)",
    lineWidth: 2,
  },
  state_parks: {
    chip: "rgba(20, 184, 166, 0.14)",
    stroke: "rgba(20, 184, 166, 0.90)", // teal
    fill: "rgba(20, 184, 166, 0.18)",
    lineWidth: 2,
  },
  bucks_parks: {
    chip: "rgba(234, 179, 8, 0.16)",
    stroke: "rgba(234, 179, 8, 0.95)", // amber
    fill: "rgba(234, 179, 8, 0.16)",
    lineWidth: 2,
  },
};

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
    initial.state_forests = true; // feels nice in demo
    return initial;
  });

  // Form state
  const [specimenId, setSpecimenId] = useState("");
  const [species, setSpecies] = useState("Beech");
  const [health, setHealth] = useState("Healthy");
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

  async function handleCreate(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");

    const latNum = lat === "" ? null : Number(lat);
    const lngNum = lng === "" ? null : Number(lng);

    const { error } = await supabase.rpc("create_specimen", {
      p_specimen_id: specimenId.trim(),
      p_species: species.trim() || null,
      p_health: health || null,
      p_dbh_in: dbhIn === "" ? null : Number(dbhIn),
      p_notes: notes.trim() || null,
      p_observed_date: observedDate || null,
      p_lat: latNum,
      p_lng: lngNum,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setSpecimenId("");
    setHealth("Healthy");
    setDbhIn("");
    setNotes("");
    setLat("");
    setLng("");
    setGpsStatus("");
    clearDraftMarker();

    await refreshAll();
  }

  // --- overlays (geometry-safe) ---
  async function ensureOverlayLoaded(map, overlay) {
    const sourceId = `overlay-src-${overlay.key}`;
    const fillLayerId = `overlay-fill-${overlay.key}`;
    const outlinePolyLayerId = `overlay-outline-poly-${overlay.key}`;
    const outlineLineLayerId = `overlay-outline-line-${overlay.key}`;

    if (map.getSource(sourceId)) return;

    const res = await fetch(overlay.url);
    if (!res.ok) throw new Error(`Failed to load ${overlay.label} (${overlay.url})`);
    const data = await res.json();

    setOverlayData((prev) => ({ ...prev, [overlay.key]: data }));

    map.addSource(sourceId, { type: "geojson", data });

    const token = LAYER_STYLE[overlay.key] || {
      stroke: "rgba(255,255,255,0.9)",
      fill: "rgba(255,255,255,0.12)",
      lineWidth: 2,
    };

    // fill polygons
    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      paint: {
        "fill-color": token.fill,
        "fill-opacity": 1,
      },
      layout: { visibility: "none" },
    });

    // outline polygons
    map.addLayer({
      id: outlinePolyLayerId,
      type: "line",
      source: sourceId,
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      paint: {
        "line-color": token.stroke,
        "line-width": token.lineWidth,
        "line-opacity": 1,
      },
      layout: { visibility: "none" },
    });

    // outline lines
    map.addLayer({
      id: outlineLineLayerId,
      type: "line",
      source: sourceId,
      filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
      paint: {
        "line-color": token.stroke,
        "line-width": token.lineWidth + 1,
        "line-opacity": 1,
      },
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

  // Initialize map
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
          "circle-color": "rgba(255,255,255,0.24)",
          "circle-radius": 14,
          "circle-opacity": 0.9,
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(255,255,255,0.35)",
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
          "circle-stroke-color": "rgba(11,15,25,0.65)",
          "circle-opacity": 0.95,
        },
      });

      map.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        setDraftLocation(lat, lng);
      });

      map.on("click", "specimens-points", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        setSelected(feature.properties || null);

        const coords = feature.geometry?.coordinates;
        if (coords?.length === 2) {
          map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 14) });
        }
      });

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

      // Load overlays
      try {
        for (const overlay of OVERLAYS) {
          await ensureOverlayLoaded(map, overlay);
          setOverlayVisibility(map, overlay.key, !!overlayOn[overlay.key]);
        }

        // default: fly to Bucks if boundary is on
        if (overlayOn.bucks_boundary) {
          setTimeout(() => {
            flyToOverlay(map, "bucks_boundary");
          }, 250);
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

  // Update specimen geojson on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("specimens");
    if (!source) return;
    source.setData(geojson || { type: "FeatureCollection", features: [] });
  }, [geojson]);

  // Update overlay visibility on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const overlay of OVERLAYS) {
      setOverlayVisibility(map, overlay.key, !!overlayOn[overlay.key]);
    }
  }, [overlayOn]);

  function toggleOverlay(key) {
    setOverlayOn((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleFlyToBucks() {
    const map = mapRef.current;
    if (!map) return;

    if (!overlayData.bucks_boundary) {
      setError("Bucks boundary not loaded yet. Toggle it on once, then try again.");
      return;
    }
    flyToOverlay(map, "bucks_boundary");
  }

  // --- UI styles (forest-y) ---
  const styles = {
    app: {
      height: "100vh",
      width: "100vw",
      display: "flex",
      color: "rgba(255,255,255,0.92)",
      // subtle dark forest gradient background
      background:
        "radial-gradient(1200px 800px at 18% 12%, rgba(34,197,94,0.10) 0%, rgba(11,15,25,0) 55%), radial-gradient(900px 700px at 90% 0%, rgba(20,184,166,0.09) 0%, rgba(11,15,25,0) 55%), linear-gradient(180deg, #060A0F 0%, #0B1320 55%, #05080D 100%)",
    },
    mapShell: {
      flex: 1,
      position: "relative",
      minWidth: 0,
      borderRight: "1px solid rgba(255,255,255,0.06)",
    },
    map: { width: "100%", height: "100%", background: "#0B1220" },
    glassCard: {
      position: "absolute",
      top: 16,
      left: 16,
      padding: "12px 14px",
      borderRadius: 16,
      background: "rgba(10, 14, 22, 0.60)",
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
      backdropFilter: "blur(10px)",
      fontFamily: "system-ui",
      maxWidth: 360,
    },
    brandTitle: {
      fontWeight: 850,
      letterSpacing: 0.2,
      fontSize: 16,
      display: "flex",
      alignItems: "baseline",
      gap: 10,
    },
    brandBadge: {
      fontSize: 11,
      padding: "3px 8px",
      borderRadius: 999,
      background: "rgba(34,197,94,0.14)",
      border: "1px solid rgba(34,197,94,0.20)",
      color: "rgba(216, 255, 232, 0.95)",
      fontWeight: 700,
    },
    subtle: { fontSize: 12, opacity: 0.78, marginTop: 6, lineHeight: 1.35 },
    panel: {
      width: 420,
      maxWidth: "42vw",
      padding: 16,
      overflow: "auto",
      background: "rgba(10, 14, 22, 0.70)",
      borderLeft: "1px solid rgba(255,255,255,0.10)",
      backdropFilter: "blur(10px)",
      fontFamily: "system-ui",
      color: "rgba(255,255,255,0.92)",
    },
    h2: { marginTop: 0, fontSize: 14, letterSpacing: 0.3, opacity: 0.9 },
    divider: { margin: "16px 0", border: "none", borderTop: "1px solid rgba(255,255,255,0.10)" },
    row: { display: "grid", gap: 10 },
    toggleCard: (key) => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.04)",
    }),
    chip: (key) => ({
      width: 12,
      height: 12,
      borderRadius: 4,
      background: (LAYER_STYLE[key]?.chip || "rgba(255,255,255,0.12)"),
      border: "1px solid rgba(255,255,255,0.18)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.25)",
      flexShrink: 0,
    }),
    pillButton: (primary) => ({
      padding: "10px 12px",
      borderRadius: 14,
      border: primary ? "1px solid rgba(34,197,94,0.22)" : "1px solid rgba(255,255,255,0.12)",
      background: primary ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
      cursor: "pointer",
      fontWeight: 800,
      color: "rgba(255,255,255,0.92)",
    }),
    input: {
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      color: "rgba(255,255,255,0.92)",
      background: "rgba(255,255,255,0.04)",
      outline: "none",
    },
    textarea: {
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      color: "rgba(255,255,255,0.92)",
      background: "rgba(255,255,255,0.04)",
      outline: "none",
      resize: "vertical",
    },
    label: { fontSize: 12, opacity: 0.75 },
    small: { fontSize: 12, opacity: 0.75 },
    list: { paddingLeft: 18, lineHeight: 1.7, margin: 0, opacity: 0.95 },
  };

  return (
    <div style={styles.app}>
      {/* MAP */}
      <div style={styles.mapShell}>
        <div ref={mapContainerRef} style={styles.map} />

        <div style={styles.glassCard}>
          <div style={styles.brandTitle}>
            <span>BeechLens</span>
            <span style={styles.brandBadge}>MVP</span>
          </div>
          <div style={styles.subtle}>{mapStatus}</div>
          <div style={styles.subtle}>
            Click map to set location • drag marker to adjust • save to add a specimen point
          </div>
        </div>
      </div>

      {/* PANEL */}
      <aside style={styles.panel}>
        <h2 style={styles.h2}>Layers</h2>

        <div style={styles.row}>
          {OVERLAYS.map((o) => (
            <label key={o.key} style={styles.toggleCard(o.key)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={styles.chip(o.key)} />
                <span style={{ fontWeight: 750 }}>{o.label}</span>
              </div>
              <input
                type="checkbox"
                checked={!!overlayOn[o.key]}
                onChange={() => toggleOverlay(o.key)}
                style={{ width: 18, height: 18 }}
              />
            </label>
          ))}

          <button type="button" onClick={handleFlyToBucks} style={styles.pillButton(true)}>
            Fly to Bucks County
          </button>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 750 }}>Legend</div>
            {OVERLAYS.map((o) => (
              <div key={`legend-${o.key}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={styles.chip(o.key)} />
                <span style={{ fontSize: 12, opacity: 0.85 }}>{o.label}</span>
              </div>
            ))}
            <div style={{ fontSize: 12, opacity: 0.70, marginTop: 6 }}>
              Specimens: white points • Draft: draggable marker
            </div>
          </div>
        </div>

        <hr style={styles.divider} />

        <h2 style={styles.h2}>Add specimen</h2>

        <form onSubmit={handleCreate} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={styles.label}>Specimen ID (tag)</label>
            <input
              value={specimenId}
              onChange={(e) => setSpecimenId(e.target.value)}
              placeholder="e.g., DEMO-009"
              style={styles.input}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={styles.label}>Species</label>
              <input value={species} onChange={(e) => setSpecies(e.target.value)} style={styles.input} />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={styles.label}>Health</label>
              <select
                value={health}
                onChange={(e) => setHealth(e.target.value)}
                style={styles.input}
              >
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
              <label style={styles.label}>DBH (inches)</label>
              <input
                value={dbhIn}
                onChange={(e) => setDbhIn(e.target.value)}
                inputMode="decimal"
                placeholder="optional"
                style={styles.input}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={styles.label}>Observed date</label>
              <input
                type="date"
                value={observedDate}
                onChange={(e) => setObservedDate(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={styles.label}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional"
              rows={3}
              style={styles.textarea}
            />
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={handleUseGPS} style={styles.pillButton(false)}>
                Use my GPS
              </button>
              <button type="button" onClick={flyToGPS} style={styles.pillButton(false)}>
                Fly to GPS
              </button>
              <span style={styles.small}>{gpsStatus}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={styles.label}>Latitude</label>
                <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" style={styles.input} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={styles.label}>Longitude</label>
                <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" style={styles.input} />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...styles.pillButton(true),
              opacity: canSubmit ? 1 : 0.45,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            Save specimen
          </button>

          <button type="button" onClick={refreshAll} style={styles.pillButton(false)}>
            Refresh map + list
          </button>

          {error && <p style={{ margin: 0, color: "rgba(248,113,113,0.95)" }}>Error: {error}</p>}
        </form>

        <hr style={styles.divider} />

        <h2 style={styles.h2}>Selected specimen</h2>
        {!selected ? (
          <p style={{ opacity: 0.75 }}>Click a point on the map.</p>
        ) : (
          <div style={{ marginTop: 10, lineHeight: 1.6, opacity: 0.95 }}>
            <div style={{ fontWeight: 850 }}>{selected.specimen_id}</div>
            <div style={{ opacity: 0.85 }}>
              {selected.species} • {selected.health}
            </div>
            {selected.observed_date && <div>Observed: {selected.observed_date}</div>}
            {selected.dbh_in != null && <div>DBH: {selected.dbh_in}"</div>}
            {selected.notes && <div>Notes: {selected.notes}</div>}
          </div>
        )}

        <hr style={styles.divider} />

        <h2 style={styles.h2}>Latest specimens</h2>
        {specimenList.length === 0 ? (
          <p style={{ opacity: 0.75 }}>None yet.</p>
        ) : (
          <ul style={styles.list}>
            {specimenList.map((r) => (
              <li key={r.id}>
                <strong style={{ color: "rgba(255,255,255,0.92)" }}>{r.specimen_id}</strong>{" "}
                <span style={{ opacity: 0.8 }}>— {r.health}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
