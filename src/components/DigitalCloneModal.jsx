import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";

const FIELD_SKY = "#E9E5DC";
const FIELD_FOG = "#e8e3d5";
const LEAF_LITTER = "#d8d0b8";
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DEBUG_FORK = false;

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

function getCloneProfile(specimen = {}) {
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
  const leafAmount = clamp(crownFactor * leafFactor * healthFactor * bldFactor * diebackFactor * (1 - affected / 130), 0, 1.18);
  const deadAmount = clamp((1 - leafAmount) * 0.65 + affected / 160 + (health === "Dead" ? 0.7 : 0), 0, 1);

  return {
    age,
    health,
    bld,
    height: clamp(base.height * heightFactor, 1.7, 6.4),
    trunk: clamp(base.trunk * 0.55 + trunkFromDbh * 0.45, 0.06, 0.44),
    primaryCount: Math.round(clamp(base.primary * branchFactor * THREE.MathUtils.lerp(0.86, 1.16, crownFactor), 5, 22)),
    spread: clamp(base.spread * canopyFactor, 0.75, 2.8),
    leafAmount,
    leafCount: Math.round(clamp(base.leaves * leafAmount, health === "Dead" ? 0 : 40, health === "Dead" ? 40 : 1400)),
    deadAmount,
    branchDensity: clamp(branchFactor * THREE.MathUtils.lerp(0.82, 1.16, crownFactor), 0.58, 1.24),
    gapAmount: clamp((1 - leafAmount) * 0.35 + affected / 150 + deadAmount * 0.18, 0, 0.72),
    asymmetry: optionFactor(branchStructure, { Balanced: 0.18, Asymmetric: 0.55, Sparse: 0.35, Broken: 0.48, "Dead branches": 0.42 }, 0.3),
    lean: optionFactor(trunkForm, { Straight: 0.05, Leaning: 0.45, Forked: 0.18, "Multi-stem": 0.25, "Cavity present": 0.12 }, 0.12),
    forked: trunkForm === "Forked" || trunkForm === "Multi-stem",
    bark: health === "Dead" ? "#686156" : barkCondition === "Damaged" || barkCondition === "Cankered" ? "#7a7368" : "#918a7f",
    barkDark: "#5d554c",
    crownYOffset: canopyPosition === "Suppressed" ? 0.35 : canopyPosition === "Open edge" ? -0.1 : 0,
    affected,
    dieback,
    seed: hashSeed(specimen.specimen_id || specimen.id || specimen.adopted_name || "beech"),
  };
}

function makeTubePiece(controlPoints, radiusStart, radiusEnd, { samples = 7, radialSegments = 6, color = "#918a7f", radiusEase = 1.15 } = {}) {
  const curve = new THREE.CatmullRomCurve3(controlPoints);
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
  const unit = direction.clone().normalize();
  const overlap = length * 0.055;
  const expandedFrom = from.clone().add(unit.clone().multiplyScalar(-overlap));
  const expandedTo = to.clone().add(unit.clone().multiplyScalar(overlap));
  const expandedDirection = expandedTo.clone().sub(expandedFrom);

  return {
    position: expandedFrom.clone().add(expandedTo).multiplyScalar(0.5).toArray(),
    quaternion: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, expandedDirection.clone().normalize()),
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
      const leafScatter = depth === 1 ? 6 : depth === 2 ? 4 : 3;
      for (let s = 0; s < leafScatter; s += 1) {
        const tLeaf = THREE.MathUtils.lerp(0.45, 0.95, s / Math.max(1, leafScatter - 1));
        addLeafAnchor(branchCurve, tLeaf, depth, length * (depth === 1 ? 0.14 : depth === 2 ? 0.1 : 0.065), bare);
      }
    }

    if (depth >= 3) return;

    const childCount = Math.max(1, Math.round((depth === 0 ? 2.8 : depth === 1 ? 2.1 : 1.35) * profile.branchDensity * THREE.MathUtils.lerp(0.86, 1.28, crownT) * (bare ? 0.55 : 1)));
    for (let i = 0; i < childCount; i += 1) {
      const t = randRange(rng, 0.52, 0.9);
      const childOrigin = branchCurve.getPoint(t);
      const tangent = branchCurve.getTangent(t).normalize();
      const yaw = randRange(rng, -0.9, 0.9) + (i - (childCount - 1) / 2) * 0.45;
      const childDir = tangent.clone().applyAxisAngle(up, yaw).add(up.clone().multiplyScalar(randRange(rng, 0.18, 0.36))).normalize();
      const parentRadiusAtAttach = THREE.MathUtils.lerp(radius, radius * 0.18, Math.pow(t, 1.15));
      addBranch(childOrigin, childDir, length * randRange(rng, depth === 0 ? 0.34 : depth === 1 ? 0.24 : 0.16, depth === 0 ? 0.52 : depth === 1 ? 0.4 : 0.28), radius * randRange(rng, 0.34, 0.5), depth + 1, clamp(crownT + randRange(rng, 0.06, 0.2), 0, 1), bare, parentRadiusAtAttach);
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
    const direction = outward.clone().add(new THREE.Vector3(0, THREE.MathUtils.lerp(0.08, 0.34, crownT), 0)).normalize();
    const length = profile.spread * THREE.MathUtils.lerp(1.0, 0.38, crownT) * randRange(rng, 0.78, 1.18);
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
    const leafScatter = 6;
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

      const size = THREE.MathUtils.lerp(0.055, 0.118, leafRng()) * THREE.MathUtils.lerp(0.78, 1.15, profile.leafAmount);
      leafCards.push({
        position: position.toArray(),
        rotation: [randRange(leafRng, -0.82, 0.82), Math.atan2(direction.x, direction.z) + randRange(leafRng, -1.4, 1.4), randRange(leafRng, -1.0, 1.0)],
        scale: [size * randRange(leafRng, 0.68, 1.28), size * randRange(leafRng, 1.08, 1.82), 1],
        category: chooseLeafCategory(leafRng, leafDistribution),
      });
    }
  }

  return {
    trunk,
    branches,
    stubs,
    collars,
    forkSleeves,
    leafCards,
    scars,
    forkDebug: {
      forkPoint: forkPoint.toArray(),
      terminalStarts: debugTerminalStarts,
    },
  };
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
    <instancedMesh ref={meshRef} args={[geometry, undefined, cards.length]} castShadow frustumCulled={false}>
      <meshStandardMaterial map={leafMap} alphaMap={textures.leafAlpha} transparent alphaTest={0.45} depthWrite={false} depthTest side={THREE.DoubleSide} roughness={0.82} />
    </instancedMesh>
  );
}

function BarkScar({ scar, barkMaterial }) {
  return (
    <mesh position={scar.position} rotation={scar.rotation} scale={scar.scale} material={barkMaterial} castShadow>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
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

function ProceduralBeechTree({ specimen }) {
  const textures = useCloneTextures();
  const barkMaterial = useBarkMaterial(textures);
  const profile = useMemo(() => getCloneProfile(specimen), [specimen]);
  const model = useMemo(() => makeTreeModel(profile), [profile]);
  const leafMaps = useMemo(() => chooseLeafTextureMaps(textures), [textures]);

  const healthyCards = model.leafCards.filter((card) => card.category === "healthy");
  const stressedCards = model.leafCards.filter((card) => card.category === "stressed");
  const diseasedCards = model.leafCards.filter((card) => card.category === "diseased");

  return (
    <group position={[0, -2.2, 0]}>
      {model.trunk.map((piece, i) => (
        <FrustumSegment key={`trunk-${i}`} piece={piece} textures={textures} seed={profile.seed + i * 23} radialSegments={24} />
      ))}
      {model.forkSleeves.map((piece, i) => (
        <FrustumSegment key={`fork-sleeve-${i}`} piece={piece} textures={textures} seed={profile.seed + i * 37} radialSegments={14} />
      ))}
      {model.branches.map((piece, i) => (
        <WoodyChain key={`branch-${i}`} piece={piece} textures={textures} seed={profile.seed + i * 67} radialSegments={piece.radialSegments || 10} />
      ))}
      {model.stubs.map((piece, i) => (
        <WoodyChain key={`stub-${i}`} piece={piece} textures={textures} seed={profile.seed + i * 97} radialSegments={piece.radialSegments || 8} />
      ))}
      {model.collars.map((collar, i) => (
        <BranchCollar key={`collar-${i}`} collar={collar} textures={textures} seed={profile.seed + i * 43} />
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

export default function DigitalCloneModal({ specimen, onClose }) {
  if (!specimen) return null;

  return (
    <div className="clone-modal">
      <div className="clone-panel">
        <div className="clone-header">
          <div>
            <p className="clone-eyebrow">Digital Clone</p>
            <h2>{specimen.adopted_name || specimen.common_name || "Beech specimen"}</h2>
          </div>
          <button onClick={onClose} className="clone-close">Close</button>
        </div>

        <div className="clone-stage">
          <Canvas shadows camera={{ position: [0, 2.2, 6], fov: 42 }} gl={{ antialias: true }}>
            <color attach="background" args={[FIELD_SKY]} />
            <fog attach="fog" args={[FIELD_FOG, 5.2, 12]} />
            <ForestLightRig />
            <BackgroundForest />
            <ForestGround />
            <ProceduralBeechTree specimen={specimen} />
            <OrbitControls enablePan enableZoom minDistance={2.8} maxDistance={10} target={[0, 1.2, 0]} />
          </Canvas>
        </div>

        <SurveyModelMeta specimen={specimen} />
      </div>
    </div>
  );
}
