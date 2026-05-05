import React, { useEffect, useMemo, useRef, useState } from "react";

const LANDMARKS = [
  { key: "base", label: "Base", instruction: "Drag the marker to the base of the trunk" },
  { key: "top", label: "Top", instruction: "Drag the marker to the top of the visible tree or canopy" },
  { key: "leftCanopy", label: "Left canopy", instruction: "Drag the marker to the left edge of the canopy" },
  { key: "rightCanopy", label: "Right canopy", instruction: "Drag the marker to the right edge of the canopy" },
  { key: "trunkGuide", label: "Trunk guide", instruction: "Drag the marker to a point higher up along the main trunk" },
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const round4 = (value) => Math.round(value * 10000) / 10000;

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

function buildCalibration(points) {
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
  };
}

export default function ClonePhotoCalibrator({ specimen, initialCalibration, onSave, onCancel }) {
  const imageRef = useRef(null);
  const [points, setPoints] = useState(() => readInitialPoints(initialCalibration));
  const [pointOrder, setPointOrder] = useState(() => getInitialPointOrder(readInitialPoints(initialCalibration)));
  const [activeIndex, setActiveIndex] = useState(() => getFirstMissingIndex(readInitialPoints(initialCalibration)));
  const [dragPoint, setDragPoint] = useState(null);
  const [localPhotoUrl, setLocalPhotoUrl] = useState("");
  const [localPhotoName, setLocalPhotoName] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const existingPhotoUrl = useMemo(() => getSpecimenPhotoUrl(specimen), [specimen]);
  const photoUrl = localPhotoUrl || existingPhotoUrl;
  const hasPhoto = Boolean(photoUrl);
  const activeLandmark = LANDMARKS[activeIndex];
  const complete = LANDMARKS.every((landmark) => points[landmark.key]);
  const derived = complete ? deriveClonePhotoCalibration(points) : null;

  useEffect(() => () => {
    if (localPhotoUrl) URL.revokeObjectURL(localPhotoUrl);
  }, [localPhotoUrl]);

  const handlePickPhoto = (file) => {
    setSaveStatus("");
    setSaveError("");
    if (localPhotoUrl) URL.revokeObjectURL(localPhotoUrl);

    if (!file) {
      setLocalPhotoUrl("");
      setLocalPhotoName("");
      return;
    }

    setLocalPhotoUrl(URL.createObjectURL(file));
    setLocalPhotoName(file.name || "Field photo");
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
    if (!complete) return;

    setSaveStatus("Saving calibration...");
    setSaveError("");

    try {
      await onSave?.(buildCalibration(points));
      setSaveStatus("Calibration saved.");
    } catch (error) {
      setSaveStatus("");
      setSaveError(error?.message || String(error));
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
              <img ref={imageRef} src={photoUrl} alt="Specimen field calibration" draggable="false" />
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
          <button type="button" className="clone-calibrator-save" disabled={!complete} onClick={handleSave}>Save calibration</button>
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
