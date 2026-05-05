import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";
if (typeof window !== "undefined") {
  window.THREE = THREE;
}
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";
import { supabase } from "../lib/supabase";
import ClonePhotoCalibrator from "./ClonePhotoCalibrator";

const FIELD_SKY = "#E9E5DC";
const FIELD_FOG = "#e8e3d5";
const LEAF_LITTER = "#d8d0b8";
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DEBUG_FORK = false;
const CLONE_QUALITY_TIERS = {
  low: {
    maxLeaves: 450,
    maxTwigs: 80,
    maxBranches: 45,
    branchScale: 0.72,
    twigScale: 0.58,
    leafScale: 0.68,
  },
  medium: {
    maxLeaves: 900,
    maxTwigs: 140,
    maxBranches: 70,
    branchScale: 1,
    twigScale: 1,
    leafScale: 1,
  },
  high: {
    maxLeaves: 1400,
    maxTwigs: 220,
    maxBranches: 100,
    branchScale: 1.42,
    twigScale: 1.55,
    leafScale: 1.35,
  },
};
const FULLNESS_SETTINGS = {
  Sparse: {
    branchMultiplier: 0.65,
    twigMultiplier: 0.45,
    leafMultiplier: 0.45,
    visualDensity: 0.65,
    canopySpreadMultiplier: 0.85,
  },
  Moderate: {
    branchMultiplier: 1.0,
    twigMultiplier: 1.0,
    leafMultiplier: 1.0,
    visualDensity: 1.0,
    canopySpreadMultiplier: 1.0,
  },
  Full: {
    branchMultiplier: 1.15,
    twigMultiplier: 1.2,
    leafMultiplier: 1.45,
    visualDensity: 1.6,
    canopySpreadMultiplier: 1.12,
  },
};

function hashSeed(value = "beech") {
  let hash = 2166136261;
  const text = String(value || "beech");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function randRange(rng, min, max) {
  return min + (max - min) * rng();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getDefaultCloneQualityTier(mode = "interactive", isMobile = false) {
  if (mode === "thumbnail") return CLONE_QUALITY_TIERS.high;
  if (mode === "calibration") return isMobile ? CLONE_QUALITY_TIERS.low : CLONE_QUALITY_TIERS.medium;
  return isMobile ? CLONE_QUALITY_TIERS.low : CLONE_QUALITY_TIERS.medium;
}

function isMobileDevice() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapEstimateHeightClass(heightClass, estimatedHeightFt) {
  const height = numberOrNull(estimatedHeightFt);
  if (height !== null) {
    if (height < 20) return "Small";
    if (height < 40) return "Medium";
    if (height < 60) return "Large";
    return "Very large";
  }

  return {
    "10–20 ft": "Small",
    "20–40 ft": "Medium",
    "40–60 ft": "Large",
    "60+ ft": "Very large",
    "Not sure": null,
  }[heightClass] || null;
}

function mapCalibrationToCloneSpecimen(specimen = {}, calibration = {}) {
  const derived = calibration?.derived || {};
  const estimates = calibration?.fieldEstimates || {};
  const leafStress = estimates.leafStress || null;
  const canopyFullness = estimates.canopyFullness || null;
  const bldSigns = estimates.bldSigns || specimen.bld_signs || "Unsure";
  const heightClass = mapEstimateHeightClass(estimates.heightClass, estimates.estimatedHeightFt);
  const crownDensity = canopyFullness === "Full" ? "Dense" : canopyFullness;
  const health = leafStress === "Heavy stress" ? "Declining" : leafStress === "Some stress" ? "Stressed" : leafStress === "None visible" ? "Healthy" : specimen.health || specimen.health_status;
  const dieback = leafStress === "Heavy stress" ? "High" : leafStress === "Some stress" ? "Moderate" : leafStress === "None visible" ? "None" : specimen.dieback_severity;
  const stressAffected = leafStress === "Heavy stress" ? 55 : leafStress === "Some stress" ? 25 : leafStress === "None visible" ? 0 : null;
  const bldAffected = bldSigns === "Yes" ? 45 : null;
  const affected = Math.max(
    Number(specimen.percent_canopy_affected) || 0,
    stressAffected ?? 0,
    bldAffected ?? 0,
  );
  const crownBias = numberOrNull(derived.crownBias);
  const trunkLean = numberOrNull(derived.trunkLean);
  const canopyWidthRatio = numberOrNull(derived.canopyWidthRatio);

  return {
    ...specimen,
    clone_calibration: calibration,
    dbh_in: numberOrNull(estimates.dbhIn) ?? specimen.dbh_in ?? null,
    estimated_height_ft: numberOrNull(estimates.estimatedHeightFt),
    age_class: estimates.ageClass || specimen.age_class || "Unknown",
    height_class: heightClass || specimen.height_class || "Unknown",
    canopy_class: canopyWidthRatio !== null
      ? canopyWidthRatio > 0.5 ? "Open grown" : canopyWidthRatio < 0.25 ? "Suppressed" : specimen.canopy_class || "Intermediate"
      : specimen.canopy_class || "Intermediate",
    crown_density: crownDensity || specimen.crown_density || "Moderate",
    leaf_density: crownDensity || specimen.leaf_density || "Moderate",
    health: health || "Unknown",
    bld_signs: bldSigns,
    dieback_severity: dieback || "Unknown",
    percent_canopy_affected: affected,
    branch_structure: crownBias !== null && Math.abs(crownBias) > 0.06 ? "Asymmetric" : specimen.branch_structure || "Balanced",
    trunk_form: trunkLean !== null && Math.abs(trunkLean) > 0.05 ? "Leaning" : specimen.trunk_form || "Straight",
  };
}

function mapLeafStressToHealth(leafStress) {
  if (leafStress === "Heavy stress") return "Declining";
  if (leafStress === "Some stress") return "Stressed";
  if (leafStress === "None visible") return "Healthy";
  return null;
}

function buildCalibrationHistoryCalibration(calibration) {
  if (!calibration) return null;
  const archived = { ...calibration };
  delete archived.previousCalibrations;
  return archived;
}

function buildCalibrationUpdatePayload(specimen = {}, calibration = {}) {
  const fieldEstimates = calibration.fieldEstimates || {};
  const existingCalibration = specimen.clone_calibration;
  const previousCalibrations = existingCalibration
    ? [
      ...((existingCalibration.previousCalibrations || []).map(buildCalibrationHistoryCalibration).filter(Boolean)),
      buildCalibrationHistoryCalibration(existingCalibration),
    ].slice(-5)
    : [];
  const nextCalibration = previousCalibrations.length
    ? { ...calibration, previousCalibrations }
    : calibration;
  const updates = {
    clone_calibration: nextCalibration,
    updated_at: new Date().toISOString(),
  };
  const dbhIn = numberOrNull(fieldEstimates.dbhIn);
  const health = mapLeafStressToHealth(fieldEstimates.leafStress);

  if (dbhIn !== null) updates.dbh_in = dbhIn;
  if (fieldEstimates.ageClass) updates.age_class = fieldEstimates.ageClass;
  if (fieldEstimates.bldSigns) updates.bld_signs = fieldEstimates.bldSigns;
  if (health) updates.health = health;

  return updates;
}

function optionFactor(value, map, fallback = 1) {
  return map[value] ?? fallback;
}

function configureTexture(texture, { repeat = [1, 1], color = false, minFilter, magFilter } = {}) {
  if (!texture) return null;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.offset.set(0, 0);
  texture.anisotropy = 4;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  if (minFilter) texture.minFilter = minFilter;
  if (magFilter) texture.magFilter = magFilter;
  texture.needsUpdate = true;
  return texture;
}

function useCloneTextures() {
  const [leafAlpha, leafDiffuse, leafDiseasedDiffuse, leafStressedDiffuse, barkDiffuse, barkBump] = useTexture([
    "/textures/beech-leaf-alpha.jpg",
    "/textures/beech-leaf-diffuse.jpg",
    "/textures/beech-leaf-diseased-diffuse.jpg",
    "/textures/beech-leaf-stressed-diffuse.jpg",
    "/textures/beech-bark-diffuse.jpg",
    "/textures/beech-bark-bump.jpg",
  ]);

  return useMemo(() => ({
    leafAlpha: configureTexture(leafAlpha, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }),
    leafDiffuse: configureTexture(leafDiffuse, { color: true }),
    leafDiseasedDiffuse: configureTexture(leafDiseasedDiffuse, { color: true }),
    leafStressedDiffuse: configureTexture(leafStressedDiffuse, { color: true }),
    barkDiffuse: configureTexture(barkDiffuse, { repeat: [1.8, 4.6], color: true }),
    barkBump: configureTexture(barkBump, { repeat: [2.2, 5.2] }),
  }), [leafAlpha, leafDiffuse, leafDiseasedDiffuse, leafStressedDiffuse, barkDiffuse, barkBump]);
}

function getLeafTextureMode(specimen) {
  const health = String(specimen.health || specimen.health_status || "Unknown").trim();
  const bld = String(specimen.bld || specimen.bld_signs || "Unsure").trim();
  const affected = Number(specimen.affected || specimen.percent_canopy_affected) || 0;
  const dieback = String(specimen.dieback || specimen.dieback_severity || "Unknown").trim();

  let distribution = { healthy: 0, stressed: 0, diseased: 0 };

  if (health === "Dead") {
    distribution = { healthy: 0, stressed: 0, diseased: 1 };
  } else if (health === "Healthy") {
    distribution = { healthy: 1, stressed: 0, diseased: 0 };
  } else if (health === "Stressed") {
    if (bld === "Yes") {
      distribution = { healthy: 0.12, stressed: 0.68, diseased: 0.2 };
    } else {
      distribution = { healthy: 0.2, stressed: 0.8, diseased: 0 };
    }
    if (affected > 40 && bld !== "Yes") {
      const drop = Math.min(0.2, (affected - 40) / 120);
      distribution.healthy = Math.max(0, distribution.healthy - drop);
      distribution.stressed = Math.min(1, distribution.stressed + drop);
    }
  } else if (health === "Declining") {
    if (bld === "Yes") {
      distribution = { healthy: 0, stressed: 0.18, diseased: 0.82 };
    } else {
      distribution = { healthy: 0, stressed: 0.25, diseased: 0.75 };
    }
    if (affected > 25) {
      const extra = Math.min(0.18, (affected - 25) / 120);
      distribution.diseased = Math.min(1, distribution.diseased + extra);
      distribution.stressed = Math.max(0, distribution.stressed - extra * 0.65);
    }
  } else {
    if (bld === "Yes" || dieback === "Severe") {
      distribution = { healthy: 0.75, stressed: 0.2, diseased: 0.05 };
    } else {
      distribution = { healthy: 0.95, stressed: 0.05, diseased: 0 };
    }
  }

  const total = distribution.healthy + distribution.stressed + distribution.diseased || 1;
  distribution.healthy /= total;
  distribution.stressed /= total;
  distribution.diseased /= total;

  return distribution;
}

function chooseLeafCategory(rng, distribution) {
  const roll = rng();
  if (roll < distribution.healthy) return "healthy";
  if (roll < distribution.healthy + distribution.stressed) return "stressed";
  return "diseased";
}

function chooseLeafTextureMaps(textures) {
  return {
    healthy: textures.leafDiffuse,
    stressed: textures.leafStressedDiffuse,
    diseased: textures.leafDiseasedDiffuse,
    alpha: textures.leafAlpha,
  };
}

function useBarkMaterial(textures) {
  return useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: "#8f887b",
      map: textures.barkDiffuse,
      bumpMap: textures.barkBump,
      bumpScale: 0.14,
      roughness: 0.9,
      metalness: 0,
      transparent: false,
      opacity: 1,
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true,
    });

    material.needsUpdate = true;
    return material;
  }, [textures.barkDiffuse, textures.barkBump]);
}

function makeBarkMaterial(seed, textures, segmentLength, radius, color = "#8f887b") {
  const rng = makeRng(seed);
  const circumferenceBase = THREE.MathUtils.lerp(1.0, 2.0, THREE.MathUtils.clamp((0.14 - radius) / 0.14, 0, 1));
  const uRepeat = THREE.MathUtils.lerp(circumferenceBase * 0.9, circumferenceBase * 1.2, rng());
  const vRepeat = Math.max(1, segmentLength * THREE.MathUtils.lerp(1.5, 3.5, rng()));
  const uOffset = rng();
  const vOffset = rng();

  const diffuse = textures.barkDiffuse.clone();
  const bump = textures.barkBump.clone();
  configureTexture(diffuse, { repeat: [uRepeat, vRepeat], color: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  configureTexture(bump, { repeat: [uRepeat * 1.05, vRepeat * 1.05], minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  diffuse.offset.set(uOffset, vOffset);
  bump.offset.set((uOffset + 0.17) % 1, (vOffset + 0.12) % 1);

  const material = new THREE.MeshStandardMaterial({
    color,
    map: diffuse,
    bumpMap: bump,
    bumpScale: THREE.MathUtils.lerp(0.10, 0.18, rng()),
    roughness: 0.9,
    metalness: 0,
    transparent: false,
    opacity: 1,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
  });

  material.needsUpdate = true;
  return material;
}

function getCloneProfile(specimen = {}, options = {}) {
  const quality = options.quality || CLONE_QUALITY_TIERS.medium;
  const qualityTier = Object.keys(CLONE_QUALITY_TIERS).find((key) => CLONE_QUALITY_TIERS[key] === quality) || "medium";
  const mode = options.mode || "interactive";
  const isInteracting = Boolean(options.isInteracting);
  const calibration = specimen.clone_calibration || {};
  const derived = calibration.derived || {};
  const estimates = calibration.fieldEstimates || {};
  const canopyFullness = estimates.canopyFullness
    || (specimen.crown_density === "Dense" || specimen.leaf_density === "Dense" ? "Full" : null)
    || (specimen.crown_density === "Sparse" || specimen.leaf_density === "Sparse" ? "Sparse" : null)
    || "Moderate";
  const fullness = FULLNESS_SETTINGS[canopyFullness] || FULLNESS_SETTINGS.Moderate;
  const age = specimen.age_class || "Unknown";
  const health = specimen.health || specimen.health_status || "Unknown";
  const bld = specimen.bld_signs || "Unsure";
  const heightClass = specimen.height_class || "Unknown";
  const canopyClass = specimen.canopy_class || "Unknown";
  const crownDensity = specimen.crown_density || "Unknown";
  const leafDensity = specimen.leaf_density || "Unknown";
  const dieback = specimen.dieback_severity || "Unknown";
  const trunkForm = specimen.trunk_form || "Unknown";
  const branchStructure = specimen.branch_structure || "Unknown";
  const barkCondition = specimen.bark_condition || "Unknown";
  const canopyPosition = specimen.canopy_position || "Unknown";
  const affected = Number(specimen.percent_canopy_affected) || 0;
  const dbh = Number(specimen.dbh_in) || 0;
  const estimatedHeightFt = numberOrNull(estimates.estimatedHeightFt ?? specimen.estimated_height_ft);
  const fieldHeightFactor = estimatedHeightFt !== null ? clamp(estimatedHeightFt / 45, 0.58, 1.36) : 1;
  const photoHeightRatio = numberOrNull(derived.heightRatio);
  const photoHeightFactor = photoHeightRatio !== null ? clamp(photoHeightRatio / 0.62, 0.78, 1.22) : 1;
  const photoSpreadRatio = numberOrNull(derived.canopyWidthRatio);
  const photoSpreadFactor = photoSpreadRatio !== null ? clamp(photoSpreadRatio / 0.42, 0.7, 1.35) : 1;
  const photoLean = numberOrNull(derived.trunkLean);
  const photoCrownBias = numberOrNull(derived.crownBias);

  const ageMap = {
    Sapling: { height: 2.5, trunk: 0.08, primary: 7, spread: 1.15, leaves: 580 },
    Young: { height: 3.5, trunk: 0.13, primary: 11, spread: 1.55, leaves: 1050 },
    Mature: { height: 4.8, trunk: 0.22, primary: 15, spread: 2.05, leaves: 1350 },
    Old: { height: 5.55, trunk: 0.31, primary: 18, spread: 2.32, leaves: 1420 },
    Unknown: { height: 3.9, trunk: 0.17, primary: 12, spread: 1.72, leaves: 950 },
  };

  const base = ageMap[age] || ageMap.Unknown;
  const heightFactor = optionFactor(heightClass, { Seedling: 0.52, Sapling: 0.68, Small: 0.82, Medium: 1, Large: 1.15, "Very large": 1.28 });
  const canopyFactor = optionFactor(canopyClass, { "Open grown": 1.24, Intermediate: 1, "Closed canopy": 0.9, Suppressed: 0.68 });
  const crownFactor = optionFactor(crownDensity, { Sparse: 0.58, Moderate: 0.88, Dense: 1.12 });
  const leafFactor = optionFactor(leafDensity, { Sparse: 0.52, Moderate: 0.82, Dense: 1.08 });
  const healthFactor = optionFactor(health, { Healthy: 1.05, Stressed: 0.75, Declining: 0.45, Dead: 0.04 }, 0.75);
  const bldFactor = optionFactor(bld, { No: 1, Unsure: 0.88, Yes: 0.55 }, 0.88);
  const diebackFactor = optionFactor(dieback, { None: 1, Low: 0.82, Moderate: 0.58, High: 0.32, Severe: 0.15 }, 0.88);
  const branchFactor = optionFactor(branchStructure, { Balanced: 1, Asymmetric: 0.96, Sparse: 0.68, Broken: 0.74, "Dead branches": 0.92 }, 0.92);
  const trunkFromDbh = dbh > 0 ? clamp(dbh / 90, 0.08, 0.44) : base.trunk;
  const conditionLeafFactor = canopyFullness === "Full"
    ? (health === "Dead" ? 0.05 : clamp(0.82 + (healthFactor - 0.75) * 0.25 + (bldFactor - 0.88) * 0.16 + (diebackFactor - 0.88) * 0.12, 0.68, 1.12))
    : healthFactor * bldFactor * diebackFactor;
  const affectedLeafFactor = canopyFullness === "Full"
    ? clamp(1 - affected / 420, 0.74, 1)
    : (1 - affected / 130);
  const leafAmount = clamp(crownFactor * leafFactor * fullness.visualDensity * conditionLeafFactor * affectedLeafFactor, 0, 1.75);
  const deadAmount = clamp((1 - leafAmount) * 0.65 + affected / 160 + (health === "Dead" ? 0.7 : 0), 0, 1);
  const branchBudget = quality.branchScale;
  const twigBudget = quality.twigScale;
  const leafBudget = quality.leafScale;
  const rawPrimaryCount = Math.round(clamp(base.primary * branchFactor * fullness.branchMultiplier * THREE.MathUtils.lerp(0.86, 1.16, crownFactor), 4, 28));
  const primaryCount = Math.min(rawPrimaryCount, quality.maxBranches);

  return {
    age,
    health,
    bld,
    height: clamp(base.height * heightFactor * fieldHeightFactor * photoHeightFactor, 1.7, 6.4),
    trunk: clamp(base.trunk * 0.55 + trunkFromDbh * 0.45, 0.06, 0.44),
    primaryCount,
    spread: clamp(base.spread * canopyFactor * fullness.canopySpreadMultiplier * photoSpreadFactor, 0.7, 3.05),
    leafAmount,
    leafCount: Math.round(clamp(base.leaves * leafAmount * fullness.leafMultiplier * leafBudget, health === "Dead" ? 0 : 30, health === "Dead" ? 50 : quality.maxLeaves)),
    deadAmount,
    branchDensity: clamp(branchFactor * fullness.branchMultiplier * THREE.MathUtils.lerp(0.82, 1.16, crownFactor) * branchBudget, 0.35, 1.95),
    twigDensity: clamp(fullness.twigMultiplier * twigBudget * (isInteracting ? 0.68 : 1), 0.32, 2.2),
    leafClusterDensity: clamp(fullness.visualDensity * (isInteracting ? 0.85 : 1) * leafBudget, 0.45, 2.4),
    leafSizeFactor: canopyFullness === "Full" ? 1.08 * leafBudget : canopyFullness === "Sparse" ? 0.88 * leafBudget : leafBudget,
    visualDensity: fullness.visualDensity * (isInteracting ? 0.88 : 1) * leafBudget,
    maxLeafCount: quality.maxLeaves,
    maxTwigCount: quality.maxTwigs,
    qualityTier,
    renderMode: mode,
    isInteracting,
    gapAmount: clamp((1 - leafAmount / Math.max(1, fullness.visualDensity)) * 0.26 + affected / (canopyFullness === "Full" ? 360 : 150) + deadAmount * (canopyFullness === "Sparse" ? 0.22 : 0.08), 0, canopyFullness === "Full" ? 0.38 : 0.78),
    asymmetry: Math.max(
      optionFactor(branchStructure, { Balanced: 0.18, Asymmetric: 0.55, Sparse: 0.35, Broken: 0.48, "Dead branches": 0.42 }, 0.3),
      photoCrownBias !== null ? clamp(Math.abs(photoCrownBias) * 1.7, 0.18, 0.75) : 0,
    ),
    lean: Math.max(
      optionFactor(trunkForm, { Straight: 0.05, Leaning: 0.45, Forked: 0.18, "Multi-stem": 0.25, "Cavity present": 0.12 }, 0.12),
      photoLean !== null ? clamp(Math.abs(photoLean) * 1.25, 0.05, 0.55) : 0,
    ),
    forked: trunkForm === "Forked" || trunkForm === "Multi-stem",
    bark: health === "Dead" ? "#686156" : barkCondition === "Damaged" || barkCondition === "Cankered" ? "#7a7368" : "#918a7f",
    barkDark: "#5d554c",
    crownYOffset: canopyPosition === "Suppressed" ? 0.35 : canopyPosition === "Open edge" ? -0.1 : 0,
    crownBias: photoCrownBias ?? 0,
    canopyFullness,
    affected,
    dieback,
    seed: hashSeed(specimen.specimen_id || specimen.id || specimen.adopted_name || "beech"),
  };
}

function normalizeCurvePoints(controlPoints) {
  const points = controlPoints
    .map((point) => (point && point.toArray ? point.toArray() : point))
    .filter((point) => Array.isArray(point) && point.length >= 3 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Number.isFinite(point[2]))
    .map((point) => new THREE.Vector3(point[0], point[1], point[2]));

  const uniquePoints = [];
  points.forEach((point) => {
    if (!uniquePoints.length || !point.equals(uniquePoints[uniquePoints.length - 1])) {
      uniquePoints.push(point);
    }
  });

  if (process.env.NODE_ENV !== "production" && uniquePoints.length < controlPoints.length) {
    console.warn("normalizeCurvePoints dropped invalid or duplicate points", {
      original: controlPoints,
      sanitized: uniquePoints.map((p) => p.toArray()),
    });
  }

  return uniquePoints;
}

function makeTubePiece(controlPoints, radiusStart, radiusEnd, { samples = 7, radialSegments = 6, color = "#918a7f", radiusEase = 1.15 } = {}) {
  const sanitizedPoints = normalizeCurvePoints(controlPoints);
  if (sanitizedPoints.length < 2) {
    return { points: [], radii: [], radialSegments, color };
  }
  const curve = new THREE.CatmullRomCurve3(sanitizedPoints);
  const points = curve.getPoints(samples);
  const radii = points.map((_, i) => {
    const t = i / Math.max(1, points.length - 1);
    return THREE.MathUtils.lerp(radiusStart, radiusEnd, Math.pow(t, radiusEase));
  });
  return { points, radii, radialSegments, color };
}

function makeTrunkSegment(start, end, radiusBottom, radiusTop, color, openEnded = false) {
  const from = start.clone();
  const to = end.clone();
  const direction = to.clone().sub(from);
  const length = direction.length();
  const unit = length > 1e-6 ? direction.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const overlap = length * 0.055;
  const expandedFrom = from.clone().add(unit.clone().multiplyScalar(-overlap));
  const expandedTo = to.clone().add(unit.clone().multiplyScalar(overlap));
  const expandedDirection = expandedTo.clone().sub(expandedFrom);
  const safeDirection = expandedDirection.lengthSq() > 1e-8 ? expandedDirection.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, safeDirection);

  if (process.env.NODE_ENV !== "production") {
    if (!Number.isFinite(safeDirection.x) || !Number.isFinite(safeDirection.y) || !Number.isFinite(safeDirection.z)) {
      console.warn("TRUNK_SEGMENT_BAD_DIRECTION", {
        from: from.toArray(),
        to: to.toArray(),
        direction: direction.toArray(),
        expandedFrom: expandedFrom.toArray(),
        expandedTo: expandedTo.toArray(),
        expandedDirection: expandedDirection.toArray(),
        safeDirection: safeDirection.toArray(),
      });
    }
    if (!Number.isFinite(quaternion.x) || !Number.isFinite(quaternion.y) || !Number.isFinite(quaternion.z) || !Number.isFinite(quaternion.w)) {
      console.warn("TRUNK_SEGMENT_BAD_QUAT", {
        safeDirection: safeDirection.toArray(),
        quaternion: quaternion.toArray(),
        from: from.toArray(),
        to: to.toArray(),
      });
    }
  }

  return {
    position: expandedFrom.clone().add(expandedTo).multiplyScalar(0.5).toArray(),
    quaternion: quaternion.toArray(),
    height: expandedDirection.length(),
    radiusBottom,
    radiusTop,
    color,
    openEnded,
  };
}

function makeFrustumSegments(points, radii, color, { openLast = false } = {}) {
  const segments = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const openEnded = openLast && i === points.length - 2;
    segments.push(makeTrunkSegment(points[i], points[i + 1], radii[i], radii[i + 1], color, openEnded));
  }
  return segments;
}

function makeTreeModel(profile) {
  const rng = makeRng(profile.seed);
  const trunkControl = [];
  const leanAngle = randRange(rng, 0, Math.PI * 2);
  const leanVector = new THREE.Vector3(Math.cos(leanAngle), 0, Math.sin(leanAngle)).multiplyScalar(profile.lean);

  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6;
    const curve = Math.sin(t * Math.PI) * 0.11;
    const sway = new THREE.Vector3(Math.sin(t * 3.1 + profile.seed * 0.001) * curve, 0, Math.cos(t * 2.7 + profile.seed * 0.001) * curve);
    const lean = leanVector.clone().multiplyScalar(t * t);
    trunkControl.push(new THREE.Vector3(sway.x + lean.x, profile.height * t, sway.z + lean.z));
  }

  const trunkCurve = new THREE.CatmullRomCurve3(trunkControl);
  const trunkSamples = Math.round(clamp(profile.height * 4, 18, 28));
  const trunkPoints = trunkCurve.getPoints(trunkSamples);
  const trunkRadii = trunkPoints.map((_, i) => {
    const t = i / Math.max(1, trunkPoints.length - 1);
    const topTaper = THREE.MathUtils.smoothstep(t, 0.78, 1);
    return profile.trunk * THREE.MathUtils.lerp(1.18, 0.22, Math.pow(t, 0.86)) * THREE.MathUtils.lerp(1, 0.82, topTaper);
  });
  const forkPoint = trunkPoints[trunkPoints.length - 1].clone();
  const forkRadius = trunkRadii[trunkRadii.length - 1];
  const forkTangent = trunkPoints[trunkPoints.length - 1].clone().sub(trunkPoints[trunkPoints.length - 2]).normalize();
  const trunk = makeFrustumSegments(trunkPoints, trunkRadii, profile.bark, { openLast: true });
  const branches = [];
  const stubs = [];
  const collars = [];
  const forkSleeves = [];
  const leafAnchors = [];
  const scars = [];
  const twigImpostors = [];
  const debugTerminalStarts = [];
  const baseRotation = randRange(rng, 0, Math.PI * 2);

  const addLeafAnchor = (branchCurve, t, depth, radius, bare) => {
    if (bare || profile.leafAmount <= 0.02) return;
    
    const segmentStart = branchCurve.getPoint(Math.max(0, t - 0.08));
    const segmentEnd = branchCurve.getPoint(Math.min(1, t + 0.08));
    const direction = segmentEnd.clone().sub(segmentStart).normalize();
    
    const depthFactor = THREE.MathUtils.lerp(0.75, 1.12, depth / 3);
    leafAnchors.push({
      start: segmentStart.toArray(),
      end: segmentEnd.toArray(),
      direction: direction.toArray(),
      crownT: t,
      radius: radius * depthFactor,
    });
  };

  const leafDistribution = getLeafTextureMode(profile);

  const addCollar = (origin, direction, parentRadius, childRadius, color) => {
    const collarRadius = Math.min(parentRadius * 0.86, Math.max(childRadius * 1.18, parentRadius * 0.28));
    collars.push({
      position: origin.clone().add(direction.clone().normalize().multiplyScalar(childRadius * 0.18)).toArray(),
      direction: direction.clone().normalize().toArray(),
      scale: [collarRadius, childRadius * 0.58, collarRadius * 0.82],
      color,
    });
  };

  const addBranch = (parentCenter, direction, length, proposedRadius, depth, crownT, parentBare = false, parentRadius = profile.trunk) => {
    const bareChance = profile.deadAmount * THREE.MathUtils.lerp(0.18, 0.78, depth / 2) + (parentBare ? 0.2 : 0);
    const bare = rng() < bareChance;
    const up = new THREE.Vector3(0, 1, 0);
    const baseRadius = depth === 0 ? Math.min(parentRadius * 0.68, proposedRadius) : Math.min(Math.min(parentRadius * 0.45, proposedRadius), parentRadius * 0.48);
    const baseRadius2 = Math.min(baseRadius, parentRadius * 0.45);
    const radius = Math.max(0.008, baseRadius2);
    const origin = parentCenter.clone().add(direction.clone().normalize().multiplyScalar(parentRadius * (depth === 0 ? 0.78 : 0.72)));
    const side = new THREE.Vector3().crossVectors(up, direction).normalize();
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    const bend = side.clone().multiplyScalar(randRange(rng, -0.16, 0.16) * length).add(up.clone().multiplyScalar(randRange(rng, 0.05, 0.18) * length));
    const shoulder = origin.clone().add(direction.clone().multiplyScalar(length * 0.2)).add(up.clone().multiplyScalar(length * 0.04));
    const mid = origin.clone().add(direction.clone().multiplyScalar(length * 0.58)).add(up.clone().multiplyScalar(length * THREE.MathUtils.lerp(0.14, 0.34, crownT))).add(bend);
    const tip = origin.clone().add(direction.clone().multiplyScalar(length)).add(up.clone().multiplyScalar(length * THREE.MathUtils.lerp(0.18, 0.48, crownT))).add(bend.clone().multiplyScalar(1.25));
    const barkColor = bare ? profile.barkDark : profile.bark;

    if (depth >= 2 && twigImpostors.length >= profile.maxTwigCount) {
      return;
    }

    if (depth >= 2 && (profile.renderMode === "interactive" || profile.qualityTier === "low" || profile.isInteracting)) {
      twigImpostors.push({
        points: [origin.toArray(), shoulder.toArray(), mid.toArray(), tip.toArray()],
        color: barkColor,
        width: Math.max(0.004, radius * 0.42),
      });
      return;
    }

    branches.push(makeTubePiece([origin, shoulder, mid, tip], radius, radius * 0.18, {
      samples: depth === 0 ? 8 : 5,
      radialSegments: depth === 0 ? 8 : depth === 1 ? 7 : 6,
      color: barkColor,
    }));
    addCollar(origin, direction, parentRadius, radius, barkColor);

    if (rng() < profile.deadAmount * (depth === 0 ? 0.32 : 0.18)) {
      const stubEnd = origin.clone().add(direction.clone().multiplyScalar(length * randRange(rng, 0.12, 0.28))).add(up.clone().multiplyScalar(length * 0.04));
      stubs.push(makeTubePiece([origin, stubEnd], radius * 0.72, radius * 0.08, { samples: 3, radialSegments: 5, color: profile.barkDark }));
    }

    const branchCurve = new THREE.CatmullRomCurve3([origin, shoulder, mid, tip]);
    
    if (depth >= 1) {
      const leafScatter = Math.max(1, Math.round((depth === 1 ? 6 : depth === 2 ? 4 : 3) * profile.leafClusterDensity));
      for (let s = 0; s < leafScatter; s += 1) {
        const tLeaf = THREE.MathUtils.lerp(0.45, 0.95, s / Math.max(1, leafScatter - 1));
        addLeafAnchor(branchCurve, tLeaf, depth, length * (depth === 1 ? 0.14 : depth === 2 ? 0.1 : 0.065), bare);
      }
    }

    if (depth >= (profile.isInteracting ? 2 : 3)) return;

    const childCount = Math.max(1, Math.round((depth === 0 ? 2.8 : depth === 1 ? 2.1 : 1.35) * profile.branchDensity * (depth >= 2 ? profile.twigDensity : 1) * THREE.MathUtils.lerp(0.86, 1.28, crownT) * (bare ? 0.55 : 1)));
    for (let i = 0; i < childCount; i += 1) {
      const t = randRange(rng, 0.52, 0.9);
      const childOrigin = branchCurve.getPoint(t);
      const tangent = branchCurve.getTangent(t).normalize();
      const yaw = randRange(rng, -0.9, 0.9) + (i - (childCount - 1) / 2) * 0.45;
      const childDir = tangent.clone().applyAxisAngle(up, yaw).add(up.clone().multiplyScalar(randRange(rng, 0.18, 0.36))).normalize();
      const parentRadiusAtAttach = THREE.MathUtils.lerp(radius, radius * 0.18, Math.pow(t, 1.15));
      addBranch(childOrigin, childDir, length * randRange(rng, depth === 0 ? 0.34 : depth === 1 ? 0.24 : 0.16, depth === 0 ? 0.52 : depth === 1 ? 0.4 : 0.28) * (depth >= 1 ? THREE.MathUtils.lerp(0.92, 1.12, profile.twigDensity / 1.8) : 1), radius * randRange(rng, 0.34, 0.5), depth + 1, clamp(crownT + randRange(rng, 0.06, 0.2), 0, 1), bare, parentRadiusAtAttach);
    }
  };

  const nodeTs = Array.from({ length: profile.primaryCount }, (_, i) => {
    const base = 0.25 + (i / Math.max(1, profile.primaryCount - 1)) * 0.68;
    return clamp(base + randRange(rng, -0.035, 0.035), 0.22, 0.94);
  }).sort((a, b) => a - b);

  nodeTs.forEach((t, i) => {
    const origin = trunkCurve.getPoint(t);
    const angle = baseRotation + i * 2.399963 + randRange(rng, -0.55, 0.55) + profile.asymmetry * Math.sin(i * 1.31);
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const crownT = (t - 0.22) / 0.72;
    const biasVector = new THREE.Vector3(profile.crownBias * 0.18, 0, 0);
    const direction = outward.clone().add(biasVector).add(new THREE.Vector3(0, THREE.MathUtils.lerp(0.08, 0.34, crownT), 0)).normalize();
    const lengthBias = clamp(1 + profile.crownBias * outward.x * 1.2, 0.72, 1.28);
    const length = profile.spread * THREE.MathUtils.lerp(1.0, 0.38, crownT) * randRange(rng, 0.78, 1.18) * lengthBias;
    const radius = profile.trunk * THREE.MathUtils.lerp(0.46, 0.14, t);
    const parentRadiusAtAttach = profile.trunk * THREE.MathUtils.lerp(1.18, 0.28, Math.pow(t, 0.86));
    addBranch(origin, direction, length, radius, 0, crownT, false, parentRadiusAtAttach);
  });

  const terminalBranchCount = 2 + Math.round(randRange(rng, 0, 2.2));
  for (let i = 0; i < terminalBranchCount; i += 1) {
    const angle = baseRotation + i * (Math.PI * 2 / terminalBranchCount) + randRange(rng, -0.35, 0.35);
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const direction = forkTangent.clone().multiplyScalar(0.28)
      .add(outward.clone().multiplyScalar(0.58))
      .add(new THREE.Vector3(0, THREE.MathUtils.lerp(0.25, 0.52, i / Math.max(1, terminalBranchCount - 1)), 0).multiplyScalar(1))
      .normalize();
    const length = profile.spread * THREE.MathUtils.lerp(0.42, 0.82, 1 - i / Math.max(1, terminalBranchCount - 1)) * randRange(rng, 0.92, 1.08);
    const proposedRadius = forkRadius * THREE.MathUtils.lerp(i === 0 ? 0.36 : 0.24, i === 0 ? 0.44 : 0.34, rng());
    const branchRadius = Math.min(proposedRadius, forkRadius * 0.45);
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(up, direction).normalize();
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    const bend = side.clone().multiplyScalar(randRange(rng, -0.16, 0.16) * length).add(up.clone().multiplyScalar(randRange(rng, 0.05, 0.18) * length));

    const terminalStart = forkPoint.clone();
    debugTerminalStarts.push(terminalStart.toArray());
    const point1 = forkPoint.clone().add(direction.clone().multiplyScalar(Math.max(length * 0.18, forkRadius * 1.6))).add(up.clone().multiplyScalar(length * 0.035));
    const trunkForkBase = forkPoint.clone().sub(forkTangent.clone().multiplyScalar(forkRadius * 0.9));
    const branchJoinPoint = forkPoint.clone().add(direction.clone().multiplyScalar(forkRadius * 1.14));
    const branchRenderStart = forkPoint.clone().add(direction.clone().multiplyScalar(forkRadius * 0.96));
    const shoulder = point1.clone();
    const mid = forkPoint.clone().add(direction.clone().multiplyScalar(length * 0.55)).add(up.clone().multiplyScalar(length * THREE.MathUtils.lerp(0.14, 0.34, 0.92))).add(bend);
    const tip = forkPoint.clone().add(direction.clone().multiplyScalar(length)).add(up.clone().multiplyScalar(length * THREE.MathUtils.lerp(0.18, 0.48, 0.92))).add(bend.clone().multiplyScalar(1.25));
    const barkColor = profile.bark;

    forkSleeves.push(makeTrunkSegment(
      trunkForkBase,
      branchJoinPoint,
      Math.min(forkRadius * 0.62, forkRadius - 0.001),
      branchRadius * 1.03,
      barkColor,
      true,
    ));

    branches.push(makeTubePiece([branchRenderStart, point1, mid, tip], branchRadius, branchRadius * 0.18, {
      samples: 8,
      radialSegments: 8,
      color: barkColor,
    }));

    const branchCurve = new THREE.CatmullRomCurve3([terminalStart, shoulder, mid, tip]);
    const leafScatter = Math.max(1, Math.round(6 * profile.leafClusterDensity));
    for (let s = 0; s < leafScatter; s += 1) {
      const tLeaf = THREE.MathUtils.lerp(0.45, 0.95, s / Math.max(1, leafScatter - 1));
      addLeafAnchor(branchCurve, tLeaf, 0, length * 0.14, false);
    }

    const childCount = Math.max(1, Math.round(2.1 * profile.branchDensity * THREE.MathUtils.lerp(0.86, 1.28, 0.92)));
    for (let j = 0; j < childCount; j += 1) {
      const t = randRange(rng, 0.52, 0.9);
      const childOrigin = branchCurve.getPoint(t);
      const tangent = branchCurve.getTangent(t).normalize();
      const yaw = randRange(rng, -0.9, 0.9) + (j - (childCount - 1) / 2) * 0.45;
      const childDir = tangent.clone().applyAxisAngle(up, yaw).add(up.clone().multiplyScalar(randRange(rng, 0.18, 0.36))).normalize();
      const parentRadiusAtAttach = THREE.MathUtils.lerp(branchRadius, branchRadius * 0.18, Math.pow(t, 1.15));
      addBranch(childOrigin, childDir, length * randRange(rng, 0.24, 0.4), branchRadius * randRange(rng, 0.34, 0.5), 1, clamp(0.92 + randRange(rng, 0.06, 0.2), 0, 1), false, parentRadiusAtAttach);
    }
  }

  collars.push({
    position: forkPoint.clone().sub(forkTangent.clone().multiplyScalar(forkRadius * 0.12)).toArray(),
    direction: forkTangent.toArray(),
    scale: [forkRadius * 0.78, forkRadius * 0.2, forkRadius * 0.68],
    color: profile.bark,
  });

  for (let i = 0; i < Math.round(randRange(rng, 2, 5) + profile.deadAmount * 4); i += 1) {
    const t = randRange(rng, 0.12, 0.82);
    const point = trunkCurve.getPoint(t);
    const angle = randRange(rng, 0, Math.PI * 2);
    const radius = profile.trunk * THREE.MathUtils.lerp(1.05, 0.35, t);
    scars.push({
      position: [point.x + Math.cos(angle) * radius * 0.78, point.y, point.z + Math.sin(angle) * radius * 0.78],
      rotation: [randRange(rng, -0.25, 0.25), angle, randRange(rng, -0.2, 0.2)],
      scale: [profile.trunk * 0.22, randRange(rng, 0.12, 0.26), 0.012],
    });
  }

  const leafCards = [];
  if (leafAnchors.length && profile.leafCount > 0) {
    const leafRng = makeRng(profile.seed ^ 0x9e3779b9);
    const position = new THREE.Vector3();
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let attempts = 0;

    while (leafCards.length < profile.leafCount && attempts < profile.leafCount * 2.5) {
      attempts += 1;
      const anchor = leafAnchors[Math.floor(leafRng() * leafAnchors.length)];
      start.fromArray(anchor.start);
      end.fromArray(anchor.end);
      direction.fromArray(anchor.direction).normalize();
      side.crossVectors(up, direction).normalize();
      if (side.lengthSq() < 0.01) side.set(1, 0, 0);
      const scatter = anchor.radius * THREE.MathUtils.lerp(0.65, 1.15, anchor.crownT);
      position
        .copy(start)
        .lerp(end, THREE.MathUtils.lerp(0.35, 0.98, Math.pow(leafRng(), 0.68)))
        .add(side.clone().multiplyScalar(randRange(leafRng, -scatter, scatter)))
        .add(up.clone().multiplyScalar(profile.crownYOffset + randRange(leafRng, -scatter * 0.32, scatter * 0.64)))
        .add(direction.clone().multiplyScalar(randRange(leafRng, -scatter * 0.2, scatter * 0.3)));

      const gapWave = Math.sin(position.x * 1.7 + profile.seed * 0.0003) * Math.cos(position.z * 1.35 - profile.seed * 0.0002);
      if (gapWave > 0.42 && leafRng() < profile.gapAmount) continue;

      const size = THREE.MathUtils.lerp(0.055, 0.118, leafRng()) * THREE.MathUtils.lerp(0.78, 1.15, profile.leafAmount) * profile.leafSizeFactor;
      leafCards.push({
        position: position.toArray(),
        rotation: [randRange(leafRng, -0.82, 0.82), Math.atan2(direction.x, direction.z) + randRange(leafRng, -1.4, 1.4), randRange(leafRng, -1.0, 1.0)],
        scale: [size * randRange(leafRng, 0.68, 1.28), size * randRange(leafRng, 1.08, 1.82), 1],
        category: chooseLeafCategory(leafRng, leafDistribution),
      });
    }
  }

  if (process.env.NODE_ENV !== "production") {
    if (leafCards.length > profile.maxLeafCount) {
      console.warn("Beech clone leaf count exceeded target cap", { leafCards: leafCards.length, cap: profile.maxLeafCount, qualityTier: profile.qualityTier });
    }
    if (twigImpostors.length > profile.maxTwigCount) {
      console.warn("Beech clone twig impostor count exceeded cap", { twigImpostors: twigImpostors.length, cap: profile.maxTwigCount, qualityTier: profile.qualityTier });
    }
    if (branches.length + stubs.length > profile.maxBranches * 2) {
      console.warn("Beech clone branch segment count is high", { branchPieces: branches.length + stubs.length, cap: profile.maxBranches * 2, qualityTier: profile.qualityTier });
    }
  }

  const model = {
    trunk,
    branches,
    stubs,
    collars,
    forkSleeves,
    twigImpostors,
    leafCards,
    scars,
    forkDebug: {
      forkPoint: forkPoint.toArray(),
      terminalStarts: debugTerminalStarts,
    },
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("TREE_MODEL", {
      trunkCount: model.trunk.length,
      forkSleeveCount: model.forkSleeves.length,
      branchCount: model.branches.length,
      stubCount: model.stubs.length,
      leafCount: model.leafCards.length,
      trunkRadiiFirst: trunkRadii.slice(0, 4),
      trunkFirstPoint: trunkPoints[0]?.toArray(),
      trunkLastPoint: trunkPoints[trunkPoints.length - 1]?.toArray(),
    });
  }

  return model;
}

function FrustumSegment({ piece, textures, seed, radialSegments = 20 }) {
  const geometry = useMemo(() => {
    const segmentGeometry = new THREE.CylinderGeometry(piece.radiusTop, piece.radiusBottom, piece.height, radialSegments, 1, piece.openEnded || false);
    segmentGeometry.computeVertexNormals();
    return segmentGeometry;
  }, [piece, radialSegments]);

  const material = useMemo(() => makeBarkMaterial(seed, textures, piece.height, (piece.radiusBottom + piece.radiusTop) * 0.5, piece.color), [seed, textures, piece.height, piece.radiusBottom, piece.radiusTop, piece.color]);

  return (
    <mesh geometry={geometry} material={material} position={piece.position} quaternion={piece.quaternion} castShadow receiveShadow />
  );
}

function WoodyChain({ piece, textures, seed, radialSegments = 10 }) {
  const segments = useMemo(() => makeFrustumSegments(piece.points, piece.radii, piece.color), [piece]);

  return (
    <group>
      {segments.map((segment, i) => (
        <FrustumSegment
          key={i}
          piece={segment}
          textures={textures}
          seed={seed + i * 31}
          radialSegments={radialSegments}
        />
      ))}
    </group>
  );
}

function BranchCollar({ collar, textures, seed }) {
  const quaternion = useMemo(() => {
    const direction = new THREE.Vector3().fromArray(collar.direction).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  }, [collar.direction]);

  const material = useMemo(() => makeBarkMaterial(seed, textures, 0.28, collar.scale[0] * 0.9, collar.color), [seed, textures, collar.scale, collar.color]);

  return (
    <mesh position={collar.position} quaternion={quaternion} scale={collar.scale} material={material} castShadow receiveShadow>
      <cylinderGeometry args={[1, 1, 1, 10, 1, false]} />
    </mesh>
  );
}

function makeLeafCardGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1.55, 3, 4);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const lengthT = (y + 0.775) / 1.55;
    position.setZ(i, Math.sin(lengthT * Math.PI) * 0.035 - Math.abs(x) * 0.018);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function InstancedLeafCards({ cards, textures, leafMap }) {
  const meshRef = useRef(null);
  const geometry = useMemo(() => {
    const geo = makeLeafCardGeometry();
    geo.computeBoundingSphere();
    if (geo.boundingSphere) geo.boundingSphere.radius = Math.max(geo.boundingSphere.radius, 2.5);
    return geo;
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    map: leafMap,
    alphaMap: textures.leafAlpha,
    transparent: true,
    alphaTest: 0.45,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    roughness: 0.82,
  }), [leafMap, textures.leafAlpha]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.frustumCulled = false;
    cards.forEach((card, i) => {
      dummy.position.fromArray(card.position);
      dummy.rotation.set(card.rotation[0], card.rotation[1], card.rotation[2]);
      dummy.scale.set(card.scale[0], card.scale[1], card.scale[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [cards, dummy]);

  if (!cards.length) return null;

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, cards.length]} castShadow frustumCulled={false} />
  );
}

function BarkScar({ scar, barkMaterial }) {
  return (
    <mesh position={scar.position} rotation={scar.rotation} scale={scar.scale} material={barkMaterial} castShadow>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function TwigImpostor({ points, color, width }) {
  const geometry = useMemo(() => {
    const sanitized = normalizeCurvePoints(points);
    if (sanitized.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(sanitized);
    return new THREE.TubeGeometry(curve, 6, Math.max(0.004, width), 4, false);
  }, [points, width]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} position={[0, 0, 0]}>
      <meshStandardMaterial color={color} roughness={0.92} metalness={0} transparent opacity={0.88} depthWrite={false} />
    </mesh>
  );
}

function MergedBarkGroup({ pieces, textures, seed, radialSegments = 8 }) {
  const geometry = useMemo(() => {
    if (!pieces.length) return null;
    const geometries = pieces.map((piece, index) => {
      const segmentGeometry = new THREE.CylinderGeometry(piece.radiusTop, piece.radiusBottom, piece.height, radialSegments, 1, piece.openEnded || false);
      segmentGeometry.computeVertexNormals();
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion().fromArray(piece.quaternion);
      const position = new THREE.Vector3().fromArray(piece.position);
      matrix.makeRotationFromQuaternion(quaternion);
      matrix.setPosition(position);
      segmentGeometry.applyMatrix4(matrix);

      if (process.env.NODE_ENV !== "production") {
        const posAttr = segmentGeometry.attributes.position;
        if (!posAttr || posAttr.count === 0 || !isFinite(posAttr.array[0]) || !isFinite(posAttr.array[posAttr.array.length - 1])) {
          const quaternionArray = quaternion.toArray();
          console.warn("TRUNK_SEGMENT_INVALID", JSON.stringify({
            index,
            height: piece.height,
            radiusTop: piece.radiusTop,
            radiusBottom: piece.radiusBottom,
            position: piece.position,
            quaternion: quaternionArray,
          }));
        }
      }
      return segmentGeometry;
    });

    return mergeGeometries(geometries, false);
  }, [pieces, radialSegments]);

  const material = useMemo(() => {
    const color = pieces[0]?.color || "#918a7f";
    return makeBarkMaterial(seed, textures, 1, 0.5, color);
  }, [seed, textures, pieces]);

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

function ForestLightRig() {
  const keyRef = useRef(null);
  const fillRef = useRef(null);

  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    const orbit = Math.atan2(camera.position.x, camera.position.z);
    if (keyRef.current) {
      keyRef.current.position.x = Math.sin(orbit + 0.65) * 3.8;
      keyRef.current.position.z = Math.cos(orbit + 0.65) * 3.4;
      keyRef.current.position.y = 6.4 + Math.sin(t * 0.16) * 0.1;
    }
    if (fillRef.current) {
      fillRef.current.position.x = Math.sin(orbit - 1.6) * 2.8;
      fillRef.current.position.z = Math.cos(orbit - 1.6) * 2.8;
    }
  });

  return (
    <>
      <ambientLight color="#f5efe2" intensity={0.34} />
      <hemisphereLight args={["#fff6dc", "#b7aa8e", 0.92]} />
      <directionalLight
        ref={keyRef}
        color="#fff0c2"
        position={[3.8, 6.4, 3.2]}
        intensity={1.25}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={7}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={14}
        shadow-bias={-0.00018}
        shadow-radius={4}
      />
      <directionalLight color="#d9ead4" position={[-4, 3.4, -2.8]} intensity={0.34} />
      <pointLight ref={fillRef} color="#C7D1C8" position={[-2.6, 1.8, 2.6]} intensity={0.36} distance={7} />
    </>
  );
}

function ForestGround() {
  return (
    <group position={[0, -2.22, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.55, 56]} />
        <meshStandardMaterial color={LEAF_LITTER} roughness={1} transparent opacity={0.78} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[2.15, 3.3, 48]} />
        <meshBasicMaterial color="#b6a77f" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <ContactShadows position={[0, 0.018, 0]} opacity={0.22} scale={6.2} blur={2.6} far={3.2} color="#6f6656" />
    </group>
  );
}

function BackgroundForest() {
  const trunks = useMemo(() => [
    { x: -2.9, z: -4.8, h: 5.2, r: 0.08, c: "#8c8579", o: 0.15 },
    { x: -1.5, z: -5.6, h: 4.3, r: 0.055, c: "#757064", o: 0.11 },
    { x: 1.7, z: -5.1, h: 5.7, r: 0.075, c: "#8b8174", o: 0.13 },
    { x: 3.0, z: -5.9, h: 4.9, r: 0.06, c: "#6f6a60", o: 0.09 },
    { x: 0.15, z: -6.4, h: 6.1, r: 0.045, c: "#928a7c", o: 0.08 },
  ], []);

  return (
    <group position={[0, -2.2, 0]}>
      {trunks.map((trunk, i) => (
        <mesh key={i} position={[trunk.x, trunk.h / 2 - 0.05, trunk.z]} rotation={[0, Math.sin(i) * 0.08, Math.sin(i * 1.7) * 0.035]}>
          <cylinderGeometry args={[trunk.r * 0.7, trunk.r, trunk.h, 6]} />
          <meshBasicMaterial color={trunk.c} transparent opacity={trunk.o} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function StaticCloneScene({ specimen, onReady, mode = "thumbnail", quality }) {
  const { gl, scene, camera, invalidate } = useThree();
  const renderQuality = quality || getDefaultCloneQualityTier(mode, false);

  useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        camera.lookAt(0, 1.25, 0);
        invalidate();
        gl.render(scene, camera);
        onReady?.(gl.domElement);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [camera, gl, invalidate, onReady, scene]);

  return (
    <>
      <color attach="background" args={[FIELD_SKY]} />
      <fog attach="fog" args={[FIELD_FOG, 5.2, 12]} />
      <ambientLight color="#f5efe2" intensity={0.38} />
      <hemisphereLight args={["#fff6dc", "#b7aa8e", 0.94]} />
      <directionalLight color="#fff0c2" position={[3.8, 6.4, 3.2]} intensity={1.25} />
      <directionalLight color="#d9ead4" position={[-4, 3.4, -2.8]} intensity={0.34} />
      <pointLight color="#C7D1C8" position={[-2.6, 1.8, 2.6]} intensity={0.34} distance={7} />
      <BackgroundForest />
      <ForestGround />
      <ProceduralBeechTree specimen={specimen} mode="thumbnail" quality={renderQuality} />
    </>
  );
}

function renderCloneThumbnailBlob(specimen, { size = 768, mode = "thumbnail", dpr = 1, imageQuality = 0.9 } = {}) {
  return new Promise((resolve, reject) => {
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-10000px";
    host.style.top = "0";
    host.style.width = `${size}px`;
    host.style.height = `${size}px`;
    host.style.pointerEvents = "none";
    host.style.opacity = "0";
    document.body.appendChild(host);

    const cleanup = () => {
      try {
        root.unmount();
      } catch {
        // noop
      }
      host.remove();
    };

    const root = createRoot(host);
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Clone thumbnail renderer timed out."));
    }, 12000);

    const finish = (canvas) => {
      canvas.toBlob((blob) => {
        window.clearTimeout(timeout);
        cleanup();
        if (!blob) {
          reject(new Error("Clone thumbnail capture failed."));
          return;
        }
        resolve(blob);
      }, "image/webp", imageQuality);
    };

    root.render(
      <Canvas
        shadows
        frameloop="demand"
        camera={{ position: [0, 2.15, 6.25], fov: 38, near: 0.1, far: 18 }}
        dpr={[dpr, dpr]}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        style={{ width: size, height: size, background: FIELD_SKY }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor(FIELD_SKY, 1);
          gl.setSize(size, size, false);
          camera.lookAt(0, 1.25, 0);
        }}
      >
        <Suspense fallback={null}>
          <StaticCloneScene specimen={specimen} onReady={finish} mode={mode} quality={getDefaultCloneQualityTier(mode, false)} />
        </Suspense>
      </Canvas>
    );
  });
}

export async function generateAndUploadCloneThumbnail(specimen) {
  if (!specimen) throw new Error("No specimen provided for thumbnail generation.");

  const storageId = specimen.specimen_id || specimen.id;
  if (!storageId) throw new Error("Specimen is missing an id or specimen_id.");

  const blob = await renderCloneThumbnailBlob(specimen, { size: 768, mode: "thumbnail", dpr: 1 });
  const cloneThumbnailPath = `specimens/${storageId}/clone-thumbnail.webp`;

  const { error: uploadError } = await supabase.storage.from("clone-thumbnails").upload(cloneThumbnailPath, blob, {
    contentType: "image/webp",
    upsert: true,
    cacheControl: "3600",
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("clone-thumbnails").getPublicUrl(cloneThumbnailPath);
  const cloneThumbnailUrl = data?.publicUrl || "";
  const cloneThumbnailUpdatedAt = new Date().toISOString();

  let updateQuery = supabase
    .from("specimens")
    .update({
      clone_thumbnail_url: cloneThumbnailUrl,
      clone_thumbnail_path: cloneThumbnailPath,
      clone_thumbnail_updated_at: cloneThumbnailUpdatedAt,
    });

  updateQuery = specimen.id ? updateQuery.eq("id", specimen.id) : updateQuery.eq("specimen_id", specimen.specimen_id);
  const { error: updateError } = await updateQuery;

  if (updateError) {
    const error = new Error(updateError.message);
    error.cause = updateError;
    error.uploadedThumbnail = {
      clone_thumbnail_url: cloneThumbnailUrl,
      clone_thumbnail_path: cloneThumbnailPath,
      clone_thumbnail_updated_at: cloneThumbnailUpdatedAt,
    };
    throw error;
  }

  return {
    clone_thumbnail_url: cloneThumbnailUrl,
    clone_thumbnail_path: cloneThumbnailPath,
    clone_thumbnail_updated_at: cloneThumbnailUpdatedAt,
  };
}

function ProceduralBeechTree({ specimen, mode = "interactive", quality, isInteracting = false }) {
  const textures = useCloneTextures();
  const barkMaterial = useBarkMaterial(textures);
  const profile = useMemo(() => getCloneProfile(specimen, { quality, mode, isInteracting }), [specimen, quality, mode, isInteracting]);
  const model = useMemo(() => makeTreeModel(profile), [profile]);
  const leafMaps = useMemo(() => chooseLeafTextureMaps(textures), [textures]);

  const healthyCards = model.leafCards.filter((card) => card.category === "healthy");
  const stressedCards = model.leafCards.filter((card) => card.category === "stressed");
  const diseasedCards = model.leafCards.filter((card) => card.category === "diseased");

  return (
    <group position={[0, -2.2, 0]}>
      <MergedBarkGroup pieces={[...model.trunk, ...model.forkSleeves]} textures={textures} seed={profile.seed} radialSegments={18} />
      {model.branches.map((piece, i) => (
        <WoodyChain key={`branch-${i}`} piece={piece} textures={textures} seed={profile.seed + i * 67} radialSegments={piece.radialSegments || 10} />
      ))}
      {model.stubs.map((piece, i) => (
        <WoodyChain key={`stub-${i}`} piece={piece} textures={textures} seed={profile.seed + i * 97} radialSegments={piece.radialSegments || 8} />
      ))}
      {model.collars.map((collar, i) => (
        <BranchCollar key={`collar-${i}`} collar={collar} textures={textures} seed={profile.seed + i * 43} />
      ))}
      {model.twigImpostors.map((twig, i) => (
        <TwigImpostor key={`twig-${i}`} points={twig.points} color={twig.color} width={twig.width} />
      ))}
      {DEBUG_FORK ? (
        <>
          <mesh position={model.forkDebug.forkPoint}>
            <sphereGeometry args={[0.045, 12, 8]} />
            <meshBasicMaterial color="red" />
          </mesh>
          {model.forkDebug.terminalStarts.map((point, i) => (
            <mesh key={`terminal-debug-${i}`} position={point}>
              <sphereGeometry args={[0.032, 10, 6]} />
              <meshBasicMaterial color="blue" />
            </mesh>
          ))}
        </>
      ) : null}
      <InstancedLeafCards cards={healthyCards} textures={textures} leafMap={leafMaps.healthy} />
      <InstancedLeafCards cards={stressedCards} textures={textures} leafMap={leafMaps.stressed} />
      <InstancedLeafCards cards={diseasedCards} textures={textures} leafMap={leafMaps.diseased} />
      {model.scars.map((scar, i) => <BarkScar key={`scar-${i}`} scar={scar} barkMaterial={barkMaterial} />)}
    </group>
  );
}

function CloneCalibrationPreview({ specimen, calibration }) {
  const previewSpecimen = useMemo(
    () => mapCalibrationToCloneSpecimen(specimen, calibration),
    [calibration, specimen],
  );
  const previewQuality = getDefaultCloneQualityTier("calibration", isMobileDevice());

  return (
    <div className="clone-calibrator-previewFrame">
      <Canvas
        shadows
        camera={{ position: [0, 2.1, 6.1], fov: 38 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={[FIELD_SKY]} />
          <fog attach="fog" args={[FIELD_FOG, 5.2, 12]} />
          <ForestLightRig />
          <BackgroundForest />
          <ForestGround />
          <ProceduralBeechTree specimen={previewSpecimen} mode="calibration" quality={previewQuality} />
          <OrbitControls enablePan={false} enableZoom={false} target={[0, 1.2, 0]} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function hasSurveyValue(value) {
  return value !== undefined && value !== null && value !== "" && value !== "Unknown";
}

function SurveyModelMeta({ specimen }) {
  const displayName = specimen.adopted_name || specimen.specimen_id || specimen.common_name || "Beech specimen";
  const rows = [
    ["Age", specimen.age_class],
    ["Health", specimen.health || specimen.health_status],
    ["BLD", specimen.bld_signs],
    ["Height", specimen.height_class],
    ["Canopy", specimen.canopy_class],
    ["Crown", specimen.crown_density],
    ["Leaf density", specimen.leaf_density],
    ["Trunk", specimen.trunk_form],
    ["Branches", specimen.branch_structure],
    ["Canopy affected", specimen.percent_canopy_affected === undefined || specimen.percent_canopy_affected === null || specimen.percent_canopy_affected === "" ? null : `${specimen.percent_canopy_affected}%`],
  ].filter(([, value]) => hasSurveyValue(value));

  return (
    <div className="clone-meta" style={{ display: "grid", gap: 10, alignItems: "start" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ fontFamily: "var(--font-heading-alt)", fontSize: 16, lineHeight: 1, color: "var(--bl-text)" }}>{displayName}</div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 10, lineHeight: 1.2, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bl-text-soft)" }}>Survey-derived model</div>
      </div>

      {rows.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px" }}>
          {rows.map(([label, value]) => (
            <span key={label} style={{ display: "inline-flex", gap: 5, alignItems: "baseline", fontFamily: "var(--font-body)", fontSize: 12, lineHeight: 1.25, color: "var(--bl-text)" }}>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bl-text-faint)" }}>{label}</span>
              <span>{value}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, lineHeight: 1.35, color: "var(--bl-text-faint)" }}>
        Generated from field survey data. Geometry is interpretive, not measured.
      </div>
    </div>
  );
}

export default function DigitalCloneModal({ specimen, onClose, isAuthed = false, onThumbnailGenerated, onCalibrationSaved, mode = "interactive" }) {
  const [thumbnailStatus, setThumbnailStatus] = useState("");
  const [thumbnailError, setThumbnailError] = useState("");
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStatus, setCalibrationStatus] = useState("");
  const [calibrationError, setCalibrationError] = useState("");
  const [isInteracting, setIsInteracting] = useState(false);
  const renderQuality = useMemo(() => getDefaultCloneQualityTier(mode, isMobileDevice()), [mode]);

  useEffect(() => {
    setIsCalibrating(false);
    setCalibrationStatus("");
    setCalibrationError("");
  }, [specimen?.id, specimen?.specimen_id]);

  if (!specimen) return null;

  const handleGenerateThumbnail = async () => {
    setIsGeneratingThumbnail(true);
    setThumbnailStatus("Generating thumbnail...");
    setThumbnailError("");

    try {
      const result = await generateAndUploadCloneThumbnail(specimen);
      setThumbnailStatus("Thumbnail saved.");
      onThumbnailGenerated?.(result);
    } catch (e) {
      console.error("Clone thumbnail generation failed", e);
      const uploadedPath = e?.uploadedThumbnail?.clone_thumbnail_path;
      setThumbnailStatus(uploadedPath ? `Uploaded to ${uploadedPath}; database update failed.` : "");
      setThumbnailError(e?.message || String(e));
    } finally {
      setIsGeneratingThumbnail(false);
    }
  };

  const handleSaveCalibration = async (calibration) => {
    if (!isAuthed) throw new Error("Sign in with a confirmed account to save clone calibration.");
    const updates = buildCalibrationUpdatePayload(specimen, calibration);

    let updateQuery = supabase
      .from("specimens")
      .update(updates);

    if (specimen.id) updateQuery = updateQuery.eq("id", specimen.id);
    else if (specimen.specimen_id) updateQuery = updateQuery.eq("specimen_id", specimen.specimen_id);
    else throw new Error("Specimen is missing an id or specimen_id.");

    const { error } = await updateQuery;
    if (error) throw error;

    setCalibrationStatus("Calibration saved.");
    setCalibrationError("");
    onCalibrationSaved?.({ ...specimen, ...updates });
    setIsCalibrating(false);
  };

  return (
    <div className="clone-modal">
      <div className={`clone-panel${isCalibrating ? " clone-panel--calibrating" : ""}`}>
        {!isCalibrating ? (
          <div className="clone-header">
            <div>
              <p className="clone-eyebrow">Digital Clone</p>
              <h2>{specimen.adopted_name || specimen.common_name || "Beech specimen"}</h2>
            </div>
            <div className="clone-actions">
              <button
                type="button"
                onClick={() => {
                  setIsCalibrating(true);
                  setCalibrationStatus("");
                  setCalibrationError("");
                }}
                className="clone-thumbnail-button"
              >
                Calibrate from field photo
              </button>
              {isAuthed ? (
                <button type="button" onClick={handleGenerateThumbnail} className="clone-thumbnail-button" disabled={isGeneratingThumbnail}>
                  {isGeneratingThumbnail ? "Generating..." : "Generate thumbnail"}
                </button>
              ) : null}
              <button onClick={onClose} className="clone-close">Close</button>
            </div>
          </div>
        ) : null}

        {isCalibrating ? (
          <ClonePhotoCalibrator
            specimen={specimen}
            initialCalibration={specimen.clone_calibration}
            onSave={handleSaveCalibration}
            onCancel={() => setIsCalibrating(false)}
            renderPreview={(calibration) => (
              <CloneCalibrationPreview specimen={specimen} calibration={calibration} />
            )}
          />
        ) : (
          <>
            <div className="clone-stage">
              <Canvas shadows camera={{ position: [0, 2.2, 6], fov: 42 }} gl={{ antialias: true }}>
                <color attach="background" args={[FIELD_SKY]} />
                <fog attach="fog" args={[FIELD_FOG, 5.2, 12]} />
                <ForestLightRig />
                <BackgroundForest />
                <ForestGround />
                <ProceduralBeechTree specimen={specimen} mode={mode} quality={renderQuality} isInteracting={isInteracting} />
                <OrbitControls
                  enablePan
                  enableZoom
                  minDistance={2.8}
                  maxDistance={10}
                  target={[0, 1.2, 0]}
                  onStart={() => setIsInteracting(true)}
                  onEnd={() => setIsInteracting(false)}
                />
              </Canvas>
            </div>

            <SurveyModelMeta specimen={specimen} />
          </>
        )}

        {thumbnailStatus || thumbnailError || calibrationStatus || calibrationError ? (
          <div className="clone-thumbnail-status" role="status">
            {thumbnailStatus ? <span>{thumbnailStatus}</span> : null}
            {thumbnailError ? <span className="clone-thumbnail-error">{thumbnailError}</span> : null}
            {calibrationStatus ? <span>{calibrationStatus}</span> : null}
            {calibrationError ? <span className="clone-thumbnail-error">{calibrationError}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
