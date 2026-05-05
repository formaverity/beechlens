import React, { useEffect, useMemo, useRef, useState } from "react";

const LANDMARKS = [
  { key: "base", label: "Base", instruction: "Drag the marker to the base of the trunk" },
  { key: "top", label: "Top", instruction: "Drag the marker to the top of the visible tree or canopy" },
  { key: "leftCanopy", label: "Left canopy", instruction: "Drag the marker to the left edge of the canopy" },
  { key: "rightCanopy", label: "Right canopy", instruction: "Drag the marker to the right edge of the canopy" },
  { key: "trunkGuide", label: "Trunk guide", instruction: "Drag the marker to a point higher up along the main trunk" },
];

const HEIGHT_CLASS_OPTIONS = ["10–20 ft", "20–40 ft", "40–60 ft", "60+ ft", "Not sure"];
const AGE_CLASS_OPTIONS = ["Sapling", "Young", "Mature", "Old", "Unknown"];
const CANOPY_FULLNESS_OPTIONS = ["Sparse", "Moderate", "Full"];
const LEAF_STRESS_OPTIONS = ["None visible", "Some stress", "Heavy stress"];
const BLD_SIGN_OPTIONS = ["No", "Unsure", "Yes"];
const CONFIDENCE_OPTIONS = ["Low", "Medium", "High"];

const EMPTY_FIELD_ESTIMATES = {
  heightClass: null,
  estimatedHeightFt: null,
  dbhIn: null,
  ageClass: null,
  canopyFullness: null,
  leafStress: null,
  bldSigns: null,
  confidence: null,
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const round4 = (value) => Math.round(value * 10000) / 10000;
const finiteOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function readInitialPoints(initialCalibration) {
  const next = {};
  const sourcePoints = initialCalibration?.points || {};

  for (const landmark of LANDMARKS) {
    const point = sourcePoints[landmark.key];
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      next[landmark.key] = { x: clamp01(x), y: clamp01(y) };
    }
  }

  return next;
}

function getFirstMissingIndex(points) {
  const index = LANDMARKS.findIndex((landmark) => !points[landmark.key]);
  return index === -1 ? LANDMARKS.length - 1 : index;
}

function getInitialPointOrder(points) {
  return LANDMARKS.filter((landmark) => points[landmark.key]).map((landmark) => landmark.key);
}

function readInitialFieldEstimates(initialCalibration) {
  const source = initialCalibration?.fieldEstimates || {};
  return {
    ...EMPTY_FIELD_ESTIMATES,
    heightClass: source.heightClass || null,
    estimatedHeightFt: finiteOrNull(source.estimatedHeightFt),
    dbhIn: finiteOrNull(source.dbhIn),
    ageClass: source.ageClass || null,
    canopyFullness: source.canopyFullness || null,
    leafStress: source.leafStress || null,
    bldSigns: source.bldSigns || null,
    confidence: source.confidence || null,
  };
}

function getSpecimenPhotoUrl(specimen) {
  const direct = specimen?.latest_photo_url
    || specimen?.photo_url
    || specimen?.primary_photo_url
    || specimen?.image_url
    || specimen?.clone_photo_url
    || specimen?.photoUrl;

  if (direct) return direct;

  if (Array.isArray(specimen?.photos) && specimen.photos.length) {
    return specimen.photos[0]?.photo_url || specimen.photos[0]?.url || "";
  }

  const notes = String(specimen?.notes || "");
  return notes.match(/^\s*Photo:\s*(https?:\/\/\S+)\s*$/im)?.[1] || "";
}

function deriveClonePhotoCalibration(points) {
  const base = points.base;
  const top = points.top;
  const leftCanopy = points.leftCanopy;
  const rightCanopy = points.rightCanopy;
  const trunkGuide = points.trunkGuide;
  const canopyCenterX = (leftCanopy.x + rightCanopy.x) / 2;

  return {
    heightRatio: round4(Math.abs(base.y - top.y)),
    canopyWidthRatio: round4(Math.abs(rightCanopy.x - leftCanopy.x)),
    trunkLean: round4(trunkGuide.x - base.x),
    crownBias: round4(canopyCenterX - base.x),
    canopyTopY: round4(top.y),
  };
}

function readCurrentPoints(points) {
  const normalizedPoints = {};
  for (const landmark of LANDMARKS) {
    const point = points[landmark.key];
    if (point) {
      normalizedPoints[landmark.key] = {
        x: round4(point.x),
        y: round4(point.y),
      };
    }
  }
  return normalizedPoints;
}

function derivePartialClonePhotoCalibration(points) {
  const derived = {};
  if (points.base && points.top) {
    derived.heightRatio = round4(Math.abs(points.base.y - points.top.y));
  }
  if (points.leftCanopy && points.rightCanopy) {
    derived.canopyWidthRatio = round4(Math.abs(points.rightCanopy.x - points.leftCanopy.x));
  }
  if (points.base && points.trunkGuide) {
    derived.trunkLean = round4(points.trunkGuide.x - points.base.x);
  }
  if (points.base && points.leftCanopy && points.rightCanopy) {
    const canopyCenterX = (points.leftCanopy.x + points.rightCanopy.x) / 2;
    derived.crownBias = round4(canopyCenterX - points.base.x);
  }
  if (points.top) {
    derived.canopyTopY = round4(points.top.y);
  }
  return derived;
}

function buildCalibration(points, fieldEstimates = EMPTY_FIELD_ESTIMATES) {
  const normalizedPoints = {};
  for (const landmark of LANDMARKS) {
    const point = points[landmark.key];
    normalizedPoints[landmark.key] = {
      x: round4(point.x),
      y: round4(point.y),
    };
  }

  return {
    source: "field_photo_manual_v1",
    createdAt: new Date().toISOString(),
    points: normalizedPoints,
    derived: deriveClonePhotoCalibration(normalizedPoints),
    fieldEstimates: { ...EMPTY_FIELD_ESTIMATES, ...fieldEstimates },
  };
}

function generateSilhouetteHintDataUrl(image) {
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) return "";

  const maxDimension = 900;
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "";

  context.drawImage(image, 0, 0, width, height);
  const source = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);
  const grayscale = new Uint8Array(width * height);

  for (let index = 0; index < grayscale.length; index += 1) {
    const pixelIndex = index * 4;
    const red = source.data[pixelIndex];
    const green = source.data[pixelIndex + 1];
    const blue = source.data[pixelIndex + 2];
    grayscale[index] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
  }

  const threshold = 24;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const right = x + 1 < width ? grayscale[index + 1] : grayscale[index];
      const bottom = y + 1 < height ? grayscale[index + width] : grayscale[index];
      const strength = Math.max(Math.abs(grayscale[index] - right), Math.abs(grayscale[index] - bottom));
      if (strength <= threshold) continue;

      const pixelIndex = index * 4;
      const alpha = Math.min(185, Math.max(0, (strength - threshold) * 4));
      output.data[pixelIndex] = 30;
      output.data[pixelIndex + 1] = 46;
      output.data[pixelIndex + 2] = 38;
      output.data[pixelIndex + 3] = alpha;
    }
  }

  context.putImageData(output, 0, 0);
  return canvas.toDataURL("image/png");
}

function FieldChipGroup({ label, value, options, onChange }) {
  return (
    <div className="clone-calibrator-fieldGroup">
      <span className="clone-calibrator-fieldLabel">{label}</span>
      <div className="clone-calibrator-chipRow">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className="clone-calibrator-fieldChip"
            data-active={value === option ? "true" : "false"}
            onClick={() => onChange(value === option ? null : option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberEstimateField({ label, value, min, max, step = "1", placeholder, helper, onChange }) {
  return (
    <label className="clone-calibrator-numberField">
      <span className="clone-calibrator-fieldLabel">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
      {helper ? <span>{helper}</span> : null}
    </label>
  );
}

export default function ClonePhotoCalibrator({ specimen, initialCalibration, onSave, onCancel, renderPreview }) {
  const imageRef = useRef(null);
  const hintGenerationRef = useRef(0);
  const [points, setPoints] = useState(() => readInitialPoints(initialCalibration));
  const [pointOrder, setPointOrder] = useState(() => getInitialPointOrder(readInitialPoints(initialCalibration)));
  const [activeIndex, setActiveIndex] = useState(() => getFirstMissingIndex(readInitialPoints(initialCalibration)));
  const [dragPoint, setDragPoint] = useState(null);
  const [fieldEstimates, setFieldEstimates] = useState(() => readInitialFieldEstimates(initialCalibration));
  const [hintEnabled, setHintEnabled] = useState(false);
  const [silhouetteHintUrl, setSilhouetteHintUrl] = useState("");
  const [localPhotoUrl, setLocalPhotoUrl] = useState("");
  const [localPhotoName, setLocalPhotoName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const existingPhotoUrl = useMemo(() => getSpecimenPhotoUrl(specimen), [specimen]);
  const photoUrl = localPhotoUrl || existingPhotoUrl;
  const hasPhoto = Boolean(photoUrl);
  const activeLandmark = LANDMARKS[activeIndex];
  const complete = LANDMARKS.every((landmark) => points[landmark.key]);
  const derived = complete ? deriveClonePhotoCalibration(points) : null;
  const currentCalibration = useMemo(() => ({
    source: "field_photo_manual_v1",
    createdAt: new Date().toISOString(),
    points: readCurrentPoints(points),
    derived: complete ? deriveClonePhotoCalibration(points) : derivePartialClonePhotoCalibration(points),
    fieldEstimates,
  }), [complete, fieldEstimates, points]);
  const preview = renderPreview?.(currentCalibration);

  useEffect(() => () => {
    if (localPhotoUrl) URL.revokeObjectURL(localPhotoUrl);
  }, [localPhotoUrl]);

  const handlePickPhoto = (file) => {
    setSaveStatus("");
    setSaveError("");
    setSilhouetteHintUrl("");
    hintGenerationRef.current += 1;
    if (localPhotoUrl) URL.revokeObjectURL(localPhotoUrl);

    if (!file) {
      setLocalPhotoUrl("");
      setLocalPhotoName("");
      return;
    }

    setLocalPhotoUrl(URL.createObjectURL(file));
    setLocalPhotoName(file.name || "Field photo");
  };

  const updateFieldEstimate = (key, value) => {
    setSaveStatus("");
    setSaveError("");
    setFieldEstimates((current) => ({
      ...current,
      [key]: value === "" ? null : value,
    }));
  };

  const handleImageLoad = (event) => {
    const image = event.currentTarget;
    const generation = hintGenerationRef.current + 1;
    hintGenerationRef.current = generation;
    setSilhouetteHintUrl("");

    window.requestAnimationFrame(() => {
      try {
        const nextHintUrl = generateSilhouetteHintDataUrl(image);
        if (hintGenerationRef.current === generation) {
          setSilhouetteHintUrl(nextHintUrl);
        }
      } catch {
        if (hintGenerationRef.current === generation) {
          setSilhouetteHintUrl("");
        }
      }
    });
  };

  const getNormalizedPoint = (event) => {
    const image = imageRef.current;
    if (!image || !photoUrl) return null;

    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      x: round4(clamp01((event.clientX - rect.left) / rect.width)),
      y: round4(clamp01((event.clientY - rect.top) / rect.height)),
    };
  };

  const finishPoint = (point) => {
    if (!point || !activeLandmark) return;

    setSaveStatus("");
    setSaveError("");
    const next = { ...points, [activeLandmark.key]: point };
    const followingMissing = LANDMARKS.findIndex((landmark, index) => index > activeIndex && !next[landmark.key]);
    const anyMissing = LANDMARKS.findIndex((landmark) => !next[landmark.key]);
    setPoints(next);
    setPointOrder((order) => [...order.filter((key) => key !== activeLandmark.key), activeLandmark.key]);
    if (followingMissing !== -1) setActiveIndex(followingMissing);
    else if (anyMissing !== -1) setActiveIndex(anyMissing);
  };

  const handlePointerDown = (event) => {
    if (!photoUrl || !activeLandmark) return;

    const point = getNormalizedPoint(event);
    if (!point) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragPoint(point);
    setSaveStatus("");
    setSaveError("");
  };

  const handlePointerMove = (event) => {
    if (!dragPoint) return;

    const point = getNormalizedPoint(event);
    if (!point) return;

    event.preventDefault();
    setDragPoint(point);
  };

  const handlePointerUp = (event) => {
    if (!dragPoint) return;

    const point = getNormalizedPoint(event) || dragPoint;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragPoint(null);
    finishPoint(point);
  };

  const handlePointerCancel = (event) => {
    if (!dragPoint) return;

    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragPoint(null);
  };

  const handleBack = () => {
    if (!pointOrder.length) return;

    const keyToRemove = pointOrder[pointOrder.length - 1];
    const indexToRestore = LANDMARKS.findIndex((landmark) => landmark.key === keyToRemove);
    setPoints((current) => {
      const next = { ...current };
      delete next[keyToRemove];
      return next;
    });
    setPointOrder((order) => order.slice(0, -1));
    setActiveIndex(indexToRestore === -1 ? 0 : indexToRestore);
    setDragPoint(null);
    setSaveStatus("");
    setSaveError("");
  };

  const handleReset = () => {
    setPoints({});
    setPointOrder([]);
    setActiveIndex(0);
    setDragPoint(null);
    setSaveStatus("");
    setSaveError("");
  };

  const handleSave = async () => {
    if (!complete || isSaving) return;

    setIsSaving(true);
    setSaveStatus("Saving calibration...");
    setSaveError("");

    try {
      await onSave?.(buildCalibration(points, fieldEstimates));
      setSaveStatus("Saved calibration.");
    } catch (error) {
      setSaveStatus("");
      setSaveError(error?.message || String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="clone-calibrator">
      <div className="clone-calibrator-guideBar">
        <span className="clone-calibrator-instruction">
          <span>{activeIndex + 1}/{LANDMARKS.length}</span>
          {activeLandmark.instruction}
        </span>
        {hasPhoto ? (
          <div className="clone-calibrator-guideActions">
            <label className="clone-calibrator-hintToggle">
              <input
                type="checkbox"
                checked={hintEnabled}
                onChange={(event) => setHintEnabled(event.target.checked)}
              />
              Silhouette hint
            </label>
            <label className="clone-calibrator-changePhoto">
              Change photo
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  handlePickPhoto(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        ) : null}
      </div>

      {!hasPhoto ? (
        <div className="clone-calibrator-photoControls">
          <label className="clone-calibrator-upload">
            Take photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                handlePickPhoto(event.target.files?.[0] || null);
                event.target.value = "";
              }}
            />
          </label>
          <label className="clone-calibrator-upload">
            Choose existing photo
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                handlePickPhoto(event.target.files?.[0] || null);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      <div className="clone-calibrator-workspace">
        <div className="clone-calibrator-photoArea">
          {photoUrl ? (
            <div className="clone-calibrator-imageShell">
              <div
                className="clone-calibrator-imageWrap"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                data-dragging={dragPoint ? "true" : "false"}
              >
                <img ref={imageRef} src={photoUrl} alt="Specimen field calibration" draggable="false" onLoad={handleImageLoad} />
                {silhouetteHintUrl && hintEnabled ? (
                  <img
                    className="clone-calibrator-silhouetteHint"
                    src={silhouetteHintUrl}
                    alt=""
                    aria-hidden="true"
                  />
                ) : null}
                <div className="clone-calibrator-overlay" aria-hidden="true">
                  {LANDMARKS.map((landmark) => {
                    const point = points[landmark.key];
                    if (!point) return null;

                    return (
                      <span
                        key={landmark.key}
                        className="clone-calibrator-marker"
                        style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                      >
                        <span className="clone-calibrator-markerDot" />
                        <span className="clone-calibrator-markerLabel">{landmark.label}</span>
                      </span>
                    );
                  })}
                  {dragPoint ? (
                    <span
                      className="clone-calibrator-marker clone-calibrator-marker--active"
                      style={{ left: `${dragPoint.x * 100}%`, top: `${dragPoint.y * 100}%` }}
                    >
                      <span className="clone-calibrator-markerDot" />
                      <span className="clone-calibrator-markerLabel">{activeLandmark.label}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="clone-calibrator-empty">Add a field photo to begin calibration.</div>
          )}
        </div>

        <div className="clone-calibrator-sidePanel">
          <p className="clone-calibrator-helperCopy">
            Measurements are guided field estimates. Photo landmarks shape the clone, while DBH, height, and canopy health refine its scale and condition.
          </p>

          <details className="clone-calibrator-section" open>
            <summary>Size</summary>
            <FieldChipGroup
              label="Height"
              value={fieldEstimates.heightClass}
              options={HEIGHT_CLASS_OPTIONS}
              onChange={(value) => updateFieldEstimate("heightClass", value)}
            />
            <NumberEstimateField
              label="Height ft"
              value={fieldEstimates.estimatedHeightFt}
              min="0"
              max="180"
              placeholder="Optional"
              onChange={(value) => updateFieldEstimate("estimatedHeightFt", finiteOrNull(value))}
            />
            <NumberEstimateField
              label="DBH in"
              value={fieldEstimates.dbhIn}
              min="0"
              max="120"
              step="0.1"
              placeholder="Optional"
              helper="Estimate trunk diameter at chest height."
              onChange={(value) => updateFieldEstimate("dbhIn", finiteOrNull(value))}
            />
          </details>

          <details className="clone-calibrator-section">
            <summary>Shape</summary>
            <FieldChipGroup
              label="Age"
              value={fieldEstimates.ageClass}
              options={AGE_CLASS_OPTIONS}
              onChange={(value) => updateFieldEstimate("ageClass", value)}
            />
            <FieldChipGroup
              label="Fullness"
              value={fieldEstimates.canopyFullness}
              options={CANOPY_FULLNESS_OPTIONS}
              onChange={(value) => updateFieldEstimate("canopyFullness", value)}
            />
          </details>

          <details className="clone-calibrator-section">
            <summary>Health</summary>
            <FieldChipGroup
              label="Leaf stress"
              value={fieldEstimates.leafStress}
              options={LEAF_STRESS_OPTIONS}
              onChange={(value) => updateFieldEstimate("leafStress", value)}
            />
            <FieldChipGroup
              label="BLD signs"
              value={fieldEstimates.bldSigns}
              options={BLD_SIGN_OPTIONS}
              onChange={(value) => updateFieldEstimate("bldSigns", value)}
            />
            <FieldChipGroup
              label="Confidence"
              value={fieldEstimates.confidence}
              options={CONFIDENCE_OPTIONS}
              onChange={(value) => updateFieldEstimate("confidence", value)}
            />
          </details>

          {preview ? (
            <details className="clone-calibrator-section clone-calibrator-previewSection" open>
              <summary>Preview</summary>
              {preview}
            </details>
          ) : null}
        </div>
      </div>

      <div className="clone-calibrator-footer">
        <div className="clone-calibrator-readout">
          <span>{localPhotoName || (existingPhotoUrl ? "Existing specimen photo" : "No photo selected")}</span>
          {derived ? (
            <span>
              H {derived.heightRatio.toFixed(3)} | W {derived.canopyWidthRatio.toFixed(3)} | Lean {derived.trunkLean.toFixed(3)}
            </span>
          ) : (
            <span>{LANDMARKS.filter((landmark) => points[landmark.key]).length} of {LANDMARKS.length} points placed</span>
          )}
        </div>

        <div className="clone-calibrator-controls">
          <button
            type="button"
            className="clone-calibrator-iconButton"
            disabled={!pointOrder.length}
            aria-label="Remove previous point"
            onClick={handleBack}
          >
            ←
          </button>
          <button
            type="button"
            className="clone-calibrator-iconButton"
            aria-label="Reset calibration points"
            onClick={handleReset}
          >
            ↺
          </button>
          <button
            type="button"
            className="clone-calibrator-iconButton"
            aria-label="Cancel calibration"
            onClick={onCancel}
          >
            ×
          </button>
          <button type="button" className="clone-calibrator-save" disabled={!complete || isSaving} onClick={handleSave}>
            {isSaving ? "Saving..." : "Save calibration"}
          </button>
        </div>
      </div>

      {saveStatus || saveError ? (
        <div className="clone-calibrator-status" role="status">
          {saveStatus ? <span>{saveStatus}</span> : null}
          {saveError ? <span className="clone-calibrator-error">{saveError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
