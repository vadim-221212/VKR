// src/App.tsx
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { analyzeEquation, analyzeSystem, buildSurface, computeCurvature } from './services/api';
import { LearningPanel } from './components/LearningPanel';
import { ResultsModal } from './components/ResultsModal';
import { LeftPanel } from './components/LeftPanel';
import { SceneViewport } from './components/SceneViewport';
import type { Surface, SurfaceType, CurvatureData, SectionData, IntersectionPoint, EquationAnalysisResponse, SystemAnalysisResponse } from './types/surface';
import './App.css';

type PlaneCoefficients = { a: number; b: number; c: number; d: number };
type ColorAnalysisMode = 'off' | 'explicit-gradient' | 'implicit-gradient' | 'curvature';
type LevelLineEntry = { id: string; surfaceId: string; value: number; curve: SectionData };

function normalizePlaneEquation(input: string): string {
  return input
    .replace(/\s+/g, '')
    .replace(/−/g, '-')
    .replace(/,/g, '.');
}

function parsePlaneEquation(input: string): PlaneCoefficients | null {
  const normalized = normalizePlaneEquation(input);
  if (!normalized) return null;

  let expression = normalized;
  if (expression.includes('=')) {
    const [left, right] = expression.split('=');
    expression = `(${left})-(${right})`;
  }

  let index = 0;
  let sign = 1;
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (char === '+') {
      sign = 1;
      index += 1;
      continue;
    }
    if (char === '-') {
      sign = -1;
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      index += 1;
      continue;
    }

    let start = index;
    while (index < expression.length && !'+-'.includes(expression[index])) {
      index += 1;
    }

    const token = expression.slice(start, index).replace(/[()]/g, '');
    if (!token) continue;

    const match = token.match(/^([0-9]*\.?[0-9]*)?(x|y|z)?$/i);
    if (!match) return null;

    const rawCoeff = match[1];
    const variable = match[2]?.toLowerCase();
    const coeff = rawCoeff === undefined || rawCoeff === '' ? 1 : Number(rawCoeff);
    if (Number.isNaN(coeff)) return null;

    const value = sign * coeff;
    if (variable === 'x') a += value;
    else if (variable === 'y') b += value;
    else if (variable === 'z') c += value;
    else d += value;

    sign = 1;
  }

  if (Math.abs(a) < 1e-10 && Math.abs(b) < 1e-10 && Math.abs(c) < 1e-10) {
    return null;
  }

  return { a, b, c, d };
}

function evaluatePlane(plane: PlaneCoefficients, point: number[]) {
  return plane.a * point[0] + plane.b * point[1] + plane.c * point[2] + plane.d;
}

function intersectSegmentWithPlane(p1: number[], p2: number[], v1: number, v2: number) {
  const denom = v1 - v2;
  if (Math.abs(denom) < 1e-10) return null;
  const t = v1 / denom;
  if (t < -1e-6 || t > 1 + 1e-6) return null;

  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
    p1[2] + (p2[2] - p1[2]) * t
  ];
}

function deduplicatePoints(points: number[][], epsilon = 1e-4) {
  const map = new Map<string, number[]>();
  for (const point of points) {
    const key = point.map((value) => Math.round(value / epsilon)).join(':');
    if (!map.has(key)) {
      map.set(key, point);
    }
  }
  return Array.from(map.values());
}

function toMathExpression(expression: string) {
  return expression
    .replace(/\^/g, '**')
    .replace(/π/gi, 'Math.PI')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|exp|log|abs|floor|ceil|round|min|max)\b/gi, 'Math.$1');
}

function preprocessImplicitEquation(equation: string) {
  const trimmed = equation.trim();
  if (!trimmed.includes('=')) return trimmed;

  const [left, right] = trimmed.split('=');
  return `(${left}) - (${right})`;
}

function compileNumericExpression(expression: string, args: string[]) {
  const compiled = toMathExpression(expression);
  return new Function(...args, `return ${compiled};`) as (...values: number[]) => number;
}

function createSurfaceResidual(surface: Surface) {
  try {
    if (surface.detectedType === 'explicit') {
      const expr = surface.equation.replace(/^z\s*=\s*/i, '').trim();
      const fn = compileNumericExpression(expr, ['x', 'y']);
      return (point: number[]) => point[2] - Number(fn(point[0], point[1]));
    }

    if (surface.detectedType === 'implicit') {
      const fn = compileNumericExpression(preprocessImplicitEquation(surface.equation), ['x', 'y', 'z']);
      return (point: number[]) => Number(fn(point[0], point[1], point[2]));
    }
  } catch (error) {
    console.warn('Не удалось создать функцию остатка для поверхности', surface.equation, error);
  }

  return null;
}

function createExplicitPointProjector(surface: Surface) {
  if (surface.detectedType !== 'explicit') return null;

  try {
    const expr = surface.equation.replace(/^z\s*=\s*/i, '').trim();
    const fn = compileNumericExpression(expr, ['x', 'y']);
    return (point: number[]) => {
      const z = Number(fn(point[0], point[1]));
      if (!Number.isFinite(z)) return point;
      return [point[0], point[1], z];
    };
  } catch (error) {
    console.warn('Не удалось создать явный проектор поверхности', surface.equation, error);
    return null;
  }
}

function refinePointToImplicitSurface(
  residual: ((point: number[]) => number) | null,
  point: number[],
  scale: number,
  iterations = 4
) {
  if (!residual) return point;

  let current = [...point];
  const step = Math.max(scale * 0.015, 1e-3);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const value = residual(current);
    if (!Number.isFinite(value)) break;
    if (Math.abs(value) < Math.max(scale * 1e-4, 1e-5)) break;

    const grad = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const plus = [...current];
      const minus = [...current];
      plus[axis] += step;
      minus[axis] -= step;
      const fPlus = residual(plus);
      const fMinus = residual(minus);
      if (!Number.isFinite(fPlus) || !Number.isFinite(fMinus)) {
        grad[axis] = 0;
      } else {
        grad[axis] = (fPlus - fMinus) / (2 * step);
      }
    }

    const gradNormSq = grad[0] * grad[0] + grad[1] * grad[1] + grad[2] * grad[2];
    if (gradNormSq < 1e-12) break;

    current = [
      current[0] - (value * grad[0]) / gradNormSq,
      current[1] - (value * grad[1]) / gradNormSq,
      current[2] - (value * grad[2]) / gradNormSq,
    ];
  }

  return current;
}

function refineIntersectionPoint(surfaceA: Surface, surfaceB: Surface, point: number[]) {
  const residualA = createSurfaceResidual(surfaceA);
  const residualB = createSurfaceResidual(surfaceB);
  const projectExplicitA = createExplicitPointProjector(surfaceA);
  const projectExplicitB = createExplicitPointProjector(surfaceB);
  const scale = Math.max(
    surfaceA.bounds.x_max - surfaceA.bounds.x_min,
    surfaceA.bounds.y_max - surfaceA.bounds.y_min,
    (surfaceA.bounds.z_max ?? 1) - (surfaceA.bounds.z_min ?? -1),
    surfaceB.bounds.x_max - surfaceB.bounds.x_min,
    surfaceB.bounds.y_max - surfaceB.bounds.y_min,
    (surfaceB.bounds.z_max ?? 1) - (surfaceB.bounds.z_min ?? -1),
    1
  );

  let current = [...point];
  for (let iteration = 0; iteration < 3; iteration += 1) {
    if (projectExplicitA) current = projectExplicitA(current);
    else current = refinePointToImplicitSurface(residualA, current, scale, 2);

    if (projectExplicitB) current = projectExplicitB(current);
    else current = refinePointToImplicitSurface(residualB, current, scale, 2);
  }

  return current;
}

function createColorRamp(t: number) {
  const clamped = Math.min(Math.max(t, 0), 1);
  return [0.16 + 0.84 * clamped, 0.35 + 0.38 * (1 - clamped), 0.98 - 0.82 * clamped];
}

function buildValueColors(values: number[]) {
  if (!values.length) return null;

  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) return values.map(() => [0.4, 0.6, 0.95]);

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const range = Math.max(maxValue - minValue, 1e-6);

  return values.map((value) => {
    if (!Number.isFinite(value)) return [0.45, 0.5, 0.6];
    return createColorRamp((value - minValue) / range);
  });
}

function computeVertexNormalsFromMesh(surface?: Surface) {
  if (!surface?.data) return null;
  const { vertices, indices, normals } = surface.data;
  if (normals && normals.length === vertices.length) return normals;

  const accumulators = vertices.map(() => [0, 0, 0]);

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i];
    const ib = indices[i + 1];
    const ic = indices[i + 2];
    const a = vertices[ia];
    const b = vertices[ib];
    const c = vertices[ic];
    if (!a || !b || !c) continue;

    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const faceNormal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];

    for (const index of [ia, ib, ic]) {
      accumulators[index][0] += faceNormal[0];
      accumulators[index][1] += faceNormal[1];
      accumulators[index][2] += faceNormal[2];
    }
  }

  return accumulators.map((normal) => {
    const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    return [normal[0] / length, normal[1] / length, normal[2] / length];
  });
}

function collectIsoPointsFromTriangle(triangle: number[][], values: number[]) {
  const hits: number[][] = [];

  for (let edge = 0; edge < 3; edge += 1) {
    const next = (edge + 1) % 3;
    const v1 = values[edge];
    const v2 = values[next];
    const p1 = triangle[edge];
    const p2 = triangle[next];

    if (!Number.isFinite(v1) || !Number.isFinite(v2)) continue;

    if (Math.abs(v1) < 1e-6 && Math.abs(v2) < 1e-6) {
      hits.push(p1, p2);
      continue;
    }
    if (Math.abs(v1) < 1e-6) {
      hits.push(p1);
      continue;
    }
    if (Math.abs(v2) < 1e-6) {
      hits.push(p2);
      continue;
    }
    if (v1 * v2 < 0) {
      const hit = intersectSegmentWithPlane(p1, p2, v1, v2);
      if (hit) hits.push(hit);
    }
  }

  return deduplicatePoints(hits);
}

function getTriangleBounds(triangle: number[][]) {
  const xs = triangle.map((point) => point[0]);
  const ys = triangle.map((point) => point[1]);
  const zs = triangle.map((point) => point[2]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs)
  };
}

function boundsOverlap(
  a: ReturnType<typeof getTriangleBounds>,
  b: ReturnType<typeof getTriangleBounds>,
  epsilon = 1e-4
) {
  return !(
    a.maxX < b.minX - epsilon || a.minX > b.maxX + epsilon ||
    a.maxY < b.minY - epsilon || a.minY > b.maxY + epsilon ||
    a.maxZ < b.minZ - epsilon || a.minZ > b.maxZ + epsilon
  );
}

function pointInTriangle3D(point: number[], triangle: number[][], epsilon = 1e-5) {
  const a = new THREE.Vector3(...triangle[0]);
  const b = new THREE.Vector3(...triangle[1]);
  const c = new THREE.Vector3(...triangle[2]);
  const p = new THREE.Vector3(...point);

  const v0 = new THREE.Vector3().subVectors(c, a);
  const v1 = new THREE.Vector3().subVectors(b, a);
  const v2 = new THREE.Vector3().subVectors(p, a);

  const dot00 = v0.dot(v0);
  const dot01 = v0.dot(v1);
  const dot02 = v0.dot(v2);
  const dot11 = v1.dot(v1);
  const dot12 = v1.dot(v2);

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < epsilon) return false;

  const inv = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;

  return u >= -epsilon && v >= -epsilon && u + v <= 1 + epsilon;
}

function intersectSegmentWithTriangle(segmentStart: number[], segmentEnd: number[], triangle: number[][]) {
  const a = new THREE.Vector3(...triangle[0]);
  const b = new THREE.Vector3(...triangle[1]);
  const c = new THREE.Vector3(...triangle[2]);
  const start = new THREE.Vector3(...segmentStart);
  const end = new THREE.Vector3(...segmentEnd);
  const direction = new THREE.Vector3().subVectors(end, start);

  const edge1 = new THREE.Vector3().subVectors(b, a);
  const edge2 = new THREE.Vector3().subVectors(c, a);
  const pvec = new THREE.Vector3().crossVectors(direction, edge2);
  const det = edge1.dot(pvec);
  if (Math.abs(det) < 1e-8) return null;

  const invDet = 1 / det;
  const tvec = new THREE.Vector3().subVectors(start, a);
  const u = tvec.dot(pvec) * invDet;
  if (u < -1e-6 || u > 1 + 1e-6) return null;

  const qvec = new THREE.Vector3().crossVectors(tvec, edge1);
  const v = direction.dot(qvec) * invDet;
  if (v < -1e-6 || u + v > 1 + 1e-6) return null;

  const t = edge2.dot(qvec) * invDet;
  if (t < -1e-6 || t > 1 + 1e-6) return null;

  return [
    segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * t,
    segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * t,
    segmentStart[2] + (segmentEnd[2] - segmentStart[2]) * t
  ];
}

function collectTriangleTriangleIntersectionPoints(triangleA: number[][], triangleB: number[][]) {
  const hits: number[][] = [];
  const edgesA = [[0, 1], [1, 2], [2, 0]];
  const edgesB = [[0, 1], [1, 2], [2, 0]];

  for (const [i, j] of edgesA) {
    const hit = intersectSegmentWithTriangle(triangleA[i], triangleA[j], triangleB);
    if (hit) hits.push(hit);
  }
  for (const [i, j] of edgesB) {
    const hit = intersectSegmentWithTriangle(triangleB[i], triangleB[j], triangleA);
    if (hit) hits.push(hit);
  }

  for (const point of triangleA) {
    if (pointInTriangle3D(point, triangleB)) hits.push(point);
  }
  for (const point of triangleB) {
    if (pointInTriangle3D(point, triangleA)) hits.push(point);
  }

  return deduplicatePoints(hits, 1e-3);
}

function collectTriangleTriangleIntersectionSegment(triangleA: number[][], triangleB: number[][]) {
  const hits = collectTriangleTriangleIntersectionPoints(triangleA, triangleB);
  if (hits.length < 2) return null;

  let bestPair: number[][] | null = null;
  let bestDistance = 0;

  for (let i = 0; i < hits.length - 1; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      const dx = hits[i][0] - hits[j][0];
      const dy = hits[i][1] - hits[j][1];
      const dz = hits[i][2] - hits[j][2];
      const distance = dx * dx + dy * dy + dz * dz;
      if (distance > bestDistance) {
        bestDistance = distance;
        bestPair = [hits[i], hits[j]];
      }
    }
  }

  if (!bestPair || bestDistance < 1e-10) return null;
  return bestPair as [number[], number[]];
}

function densifySegments(segments: number[][][], maxSegmentLength: number) {
  if (!segments.length) return [];
  const densified: number[][][] = [];

  for (const segment of segments) {
    const [start, end] = segment;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const length = Math.hypot(dx, dy, dz);
    const parts = Math.max(1, Math.ceil(length / Math.max(maxSegmentLength, 1e-6)));

    if (parts === 1) {
      densified.push(segment);
      continue;
    }

    let previous = start;
    for (let step = 1; step <= parts; step += 1) {
      const t = step / parts;
      const current = [
        start[0] + dx * t,
        start[1] + dy * t,
        start[2] + dz * t,
      ];
      densified.push([previous, current]);
      previous = current;
    }
  }

  return densified;
}

function buildTriangleSpatialHash(surface: Surface) {
  if (!surface.data) return null;

  const { vertices, indices } = surface.data;
  const bounds = surface.bounds;
  const cellCount = Math.max(6, Math.min(16, Math.round(Math.cbrt(indices.length / 3))));
  const spanX = Math.max(bounds.x_max - bounds.x_min, 1e-6);
  const spanY = Math.max(bounds.y_max - bounds.y_min, 1e-6);
  const spanZ = Math.max((bounds.z_max ?? 1) - (bounds.z_min ?? -1), 1e-6);
  const map = new Map<string, number[]>();
  const triangles: Array<{ triangle: number[][]; bounds: ReturnType<typeof getTriangleBounds> }> = [];

  const keyFor = (x: number, y: number, z: number) => `${x}:${y}:${z}`;
  const toCell = (value: number, min: number, span: number) =>
    Math.max(0, Math.min(cellCount - 1, Math.floor(((value - min) / span) * cellCount)));

  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [vertices[indices[i]], vertices[indices[i + 1]], vertices[indices[i + 2]]];
    if (triangle.some((point) => !point)) continue;

    const triangleBounds = getTriangleBounds(triangle as number[][]);
    const triangleIndex = triangles.length;
    triangles.push({ triangle: triangle as number[][], bounds: triangleBounds });

    const minX = toCell(triangleBounds.minX, bounds.x_min, spanX);
    const maxX = toCell(triangleBounds.maxX, bounds.x_min, spanX);
    const minY = toCell(triangleBounds.minY, bounds.y_min, spanY);
    const maxY = toCell(triangleBounds.maxY, bounds.y_min, spanY);
    const minZ = toCell(triangleBounds.minZ, bounds.z_min ?? -1, spanZ);
    const maxZ = toCell(triangleBounds.maxZ, bounds.z_min ?? -1, spanZ);

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          const key = keyFor(x, y, z);
          const bucket = map.get(key) ?? [];
          bucket.push(triangleIndex);
          map.set(key, bucket);
        }
      }
    }
  }

  return {
    triangles,
    map,
    cellCount,
    bounds,
    spanX,
    spanY,
    spanZ,
    toCell,
    keyFor
  };
}

function deduplicateSegments(segments: number[][][], epsilon = 1e-4) {
  const map = new Map<string, number[][]>();

  for (const segment of segments) {
    if (segment.length < 2) continue;
    const endpoints = segment.map((point) =>
      point.map((value) => Math.round(value / epsilon)).join(':')
    ).sort();
    const key = endpoints.join('|');
    if (!map.has(key)) {
      map.set(key, segment);
    }
  }

  return Array.from(map.values());
}

function buildIntersectionGeometryBetweenSurfaces(surfaceA: Surface, surfaceB: Surface) {
  if (!surfaceA.data || !surfaceB.data) return { points: [] as number[][], segments: [] as number[][][] };

  const hashB = buildTriangleSpatialHash(surfaceB);
  if (!hashB) return { points: [] as number[][], segments: [] as number[][][] };
  const rawPoints: number[][] = [];
  const rawSegments: number[][][] = [];

  const { vertices, indices } = surfaceA.data;
  const step = 3;
  const processedPairs = new Set<string>();

  for (let i = 0; i < indices.length; i += step) {
    const triangleA = [vertices[indices[i]], vertices[indices[i + 1]], vertices[indices[i + 2]]];
    if (triangleA.some((point) => !point)) continue;

    const boundsA = getTriangleBounds(triangleA as number[][]);
    const minX = hashB.toCell(boundsA.minX, hashB.bounds.x_min, hashB.spanX);
    const maxX = hashB.toCell(boundsA.maxX, hashB.bounds.x_min, hashB.spanX);
    const minY = hashB.toCell(boundsA.minY, hashB.bounds.y_min, hashB.spanY);
    const maxY = hashB.toCell(boundsA.maxY, hashB.bounds.y_min, hashB.spanY);
    const minZ = hashB.toCell(boundsA.minZ, hashB.bounds.z_min ?? -1, hashB.spanZ);
    const maxZ = hashB.toCell(boundsA.maxZ, hashB.bounds.z_min ?? -1, hashB.spanZ);

    const candidateTriangles = new Set<number>();
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          const bucket = hashB.map.get(hashB.keyFor(x, y, z));
          if (!bucket) continue;
          for (const triangleIndex of bucket) candidateTriangles.add(triangleIndex);
        }
      }
    }

    for (const candidateIndex of candidateTriangles) {
      const pairKey = `${i}:${candidateIndex}`;
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const candidate = hashB.triangles[candidateIndex];
      if (!boundsOverlap(boundsA, candidate.bounds)) continue;

      const segment = collectTriangleTriangleIntersectionSegment(triangleA as number[][], candidate.triangle);
      if (segment) {
        rawSegments.push(segment);
        rawPoints.push(segment[0], segment[1]);
      }
    }
  }

  if (rawPoints.length === 0) {
    const residualA = createSurfaceResidual(surfaceA);
    const residualB = createSurfaceResidual(surfaceB);
    if (residualA && residualB) {
      const processResidual = (source: Surface, targetResidual: (point: number[]) => number) => {
        const { vertices: sourceVertices, indices: sourceIndices } = source.data!;
        const residualStep = 3;
        for (let index = 0; index < sourceIndices.length; index += residualStep) {
          const triangle = [sourceVertices[sourceIndices[index]], sourceVertices[sourceIndices[index + 1]], sourceVertices[sourceIndices[index + 2]]];
          if (triangle.some((point) => !point)) continue;
          const values = (triangle as number[][]).map((point) => targetResidual(point));
          const hits = collectIsoPointsFromTriangle(triangle as number[][], values);
          if (hits.length >= 2) {
            rawSegments.push([hits[0], hits[1]]);
            rawPoints.push(hits[0], hits[1]);
          } else if (hits.length) {
            rawPoints.push(...hits);
          }
        }
      };
      processResidual(surfaceA, residualB);
      processResidual(surfaceB, residualA);
    }
  }

  const epsilon = Math.max(
    0.012,
    Math.min(
      0.045,
      Math.max(
        (surfaceA.bounds.x_max - surfaceA.bounds.x_min) / Math.max(surfaceA.resolution, 1),
        (surfaceB.bounds.x_max - surfaceB.bounds.x_min) / Math.max(surfaceB.resolution, 1)
      ) * 0.36
    )
  );
  const residualA = createSurfaceResidual(surfaceA);
  const residualB = createSurfaceResidual(surfaceB);
  const residualTolerance = Math.max(epsilon * 1.4, 0.018);

  const refinedPoints = rawPoints
    .map((point) => refineIntersectionPoint(surfaceA, surfaceB, point))
    .filter((point) => {
      const valueA = residualA ? Math.abs(residualA(point)) : 0;
      const valueB = residualB ? Math.abs(residualB(point)) : 0;
      return valueA <= residualTolerance && valueB <= residualTolerance;
    });

  const refinedSegments = rawSegments
    .map((segment) => segment.map((point) => refineIntersectionPoint(surfaceA, surfaceB, point)))
    .filter((segment) => {
      if (segment.length < 2) return false;
      const [start, end] = segment;
      const dx = start[0] - end[0];
      const dy = start[1] - end[1];
      const dz = start[2] - end[2];
      const lengthSq = dx * dx + dy * dy + dz * dz;
      if (lengthSq < epsilon * epsilon * 0.3) return false;

      const values = segment.map((point) => [
        residualA ? Math.abs(residualA(point)) : 0,
        residualB ? Math.abs(residualB(point)) : 0,
      ]);
      return values.every(([valueA, valueB]) => valueA <= residualTolerance && valueB <= residualTolerance);
    });

  const points = deduplicatePoints(refinedPoints.length ? refinedPoints : rawPoints, epsilon);
  const segments = densifySegments(
    deduplicateSegments(refinedSegments.length ? refinedSegments : rawSegments, epsilon),
    Math.max(epsilon * 3.2, 0.035)
  );
  return { points, segments };
}

function getNearestVertexIndex(vertices: number[][], point: { x: number; y: number; z: number }) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  vertices.forEach((vertex, index) => {
    const dx = vertex[0] - point.x;
    const dy = vertex[1] - point.y;
    const dz = vertex[2] - point.z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildPlaneBasis(plane: PlaneCoefficients) {
  const normal = new THREE.Vector3(plane.a, plane.b, plane.c);
  if (normal.lengthSq() < 1e-10) return null;
  normal.normalize();

  const helper = Math.abs(normal.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);

  const u = new THREE.Vector3().crossVectors(helper, normal).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();
  return { u, v, normal };
}

function simplifyPointSet(points: number[][] | undefined, maxPoints = 120, epsilon?: number) {
  if (!points || points.length === 0) return [];

  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const zs = points.map((point) => point[2] ?? 0);
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
    1e-6
  );
  const dedupeEpsilon = epsilon ?? Math.max(span / 220, 1e-4);
  const deduped = deduplicatePoints(points, dedupeEpsilon);
  if (deduped.length <= maxPoints) return deduped;

  const stride = Math.max(1, Math.ceil(deduped.length / maxPoints));
  return deduped.filter((_, index) => index % stride === 0);
}

function orderPointsAlongPlane(points: number[][], plane?: PlaneCoefficients | null, maxPoints = 180) {
  const simplifiedPoints = simplifyPointSet(points, maxPoints);
  if (simplifiedPoints.length < 2) return null;

  const effectivePlane = plane ?? estimatePlaneFromPoints(simplifiedPoints);
  if (!effectivePlane) {
    return {
      orderedPoints: simplifiedPoints,
      isClosed: false,
      plane: null as PlaneCoefficients | null,
    };
  }

  let projected: [number, number][] = [];
  let smoothedPoints = simplifiedPoints;

  if (Math.abs(effectivePlane.c) > 0.999 && Math.abs(effectivePlane.a) < 1e-8 && Math.abs(effectivePlane.b) < 1e-8) {
    projected = simplifiedPoints.map((point) => [point[0], point[1]]);
    const avgZ = simplifiedPoints.reduce((sum, point) => sum + point[2], 0) / simplifiedPoints.length;
    smoothedPoints = simplifiedPoints.map((point) => [point[0], point[1], avgZ]);
  } else {
    const basis = buildPlaneBasis(effectivePlane);
    if (!basis) {
      return {
        orderedPoints: simplifiedPoints,
        isClosed: false,
        plane: effectivePlane,
      };
    }
    const anchor = new THREE.Vector3(...simplifiedPoints[0]);
    projected = simplifiedPoints.map((point) => {
      const delta = new THREE.Vector3(...point).sub(anchor);
      return [delta.dot(basis.u), delta.dot(basis.v)];
    });
    smoothedPoints = projected.map(([uCoord, vCoord]) => {
      const pointOnPlane = anchor
        .clone()
        .addScaledVector(basis.u, uCoord)
        .addScaledVector(basis.v, vCoord);
      return [pointOnPlane.x, pointOnPlane.y, pointOnPlane.z];
    });
  }

  const center = projected.reduce<[number, number]>(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
    [0, 0]
  ).map((value) => value / projected.length) as [number, number];

  const ordered = smoothedPoints
    .map((point, index) => ({ point, projected: projected[index] }))
    .sort((a, b) => {
      const angleA = Math.atan2(a.projected[1] - center[1], a.projected[0] - center[0]);
      const angleB = Math.atan2(b.projected[1] - center[1], b.projected[0] - center[0]);
      return angleA - angleB;
    });

  let signedArea = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const [x1, y1] = ordered[i].projected;
    const [x2, y2] = ordered[(i + 1) % ordered.length].projected;
    signedArea += x1 * y2 - x2 * y1;
  }

  const xs = projected.map((point) => point[0]);
  const ys = projected.map((point) => point[1]);
  const diameter = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    1e-6
  );
  const isClosed = Math.abs(signedArea) / 2 > diameter * diameter * 0.02 && ordered.length >= 5;

  return {
    orderedPoints: ordered.map((item) => item.point),
    isClosed,
    plane: effectivePlane,
  };
}

function buildPolylineSegments(points: number[][], closeLoop = false) {
  if (points.length < 2) return [];
  const segments: number[][][] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    segments.push([points[i], points[i + 1]]);
  }

  if (closeLoop && points.length > 2) {
    segments.push([points[points.length - 1], points[0]]);
  }

  return segments;
}

function projectPointToPlane(point: number[], plane: PlaneCoefficients | null | undefined) {
  if (!plane) return point;
  const denominator = plane.a * plane.a + plane.b * plane.b + plane.c * plane.c;
  if (denominator < 1e-10) return point;
  const scale = (plane.a * point[0] + plane.b * point[1] + plane.c * point[2] + plane.d) / denominator;
  return [
    point[0] - plane.a * scale,
    point[1] - plane.b * scale,
    point[2] - plane.c * scale,
  ];
}

function tryBuildCircleSegments(points: number[][], plane?: PlaneCoefficients | null, sampleCount = 120) {
  const effectivePlane = plane ?? estimatePlaneFromPoints(points);
  const basis = effectivePlane ? buildPlaneBasis(effectivePlane) : null;
  if (!effectivePlane || !basis || points.length < 6) return null;

  const anchor = new THREE.Vector3(...projectPointToPlane(points[0], effectivePlane));
  const projected = points.map((point) => {
    const projectedPoint = new THREE.Vector3(...projectPointToPlane(point, effectivePlane));
    const delta = projectedPoint.sub(anchor);
    return [delta.dot(basis.u), delta.dot(basis.v)] as [number, number];
  });

  const center = projected.reduce<[number, number]>(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
    [0, 0]
  ).map((value) => value / projected.length) as [number, number];

  const radii = projected.map((point) => Math.hypot(point[0] - center[0], point[1] - center[1]));
  const averageRadius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  if (averageRadius < 1e-6) return null;

  const radiusDeviation = Math.sqrt(
    radii.reduce((sum, value) => sum + (value - averageRadius) ** 2, 0) / radii.length
  ) / averageRadius;

  const xs = projected.map((point) => point[0]);
  const ys = projected.map((point) => point[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const aspect = Math.min(width, height) / Math.max(width, height, 1e-6);

  if (radiusDeviation > 0.15 || aspect < 0.84) return null;

  const smoothPoints: number[][] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const angle = (index / sampleCount) * Math.PI * 2;
    const pointOnPlane = anchor
      .clone()
      .addScaledVector(basis.u, center[0] + Math.cos(angle) * averageRadius)
      .addScaledVector(basis.v, center[1] + Math.sin(angle) * averageRadius);
    smoothPoints.push([pointOnPlane.x, pointOnPlane.y, pointOnPlane.z]);
  }

  return buildPolylineSegments(smoothPoints, true);
}

function buildSmoothCurveSegments(
  points: number[][],
  plane?: PlaneCoefficients | null,
  options?: { closedHint?: boolean; circleHint?: boolean; sampleCount?: number }
) {
  const ordered = orderPointsAlongPlane(points, plane, 220);
  if (!ordered) return [];

  const effectivePlane = ordered.plane ?? plane ?? estimatePlaneFromPoints(ordered.orderedPoints);
  const sampleCount = options?.sampleCount ?? 96;
  const closed = options?.closedHint ?? ordered.isClosed;

  if (options?.circleHint) {
    const circleSegments = tryBuildCircleSegments(ordered.orderedPoints, effectivePlane, Math.max(sampleCount, 120));
    if (circleSegments) return circleSegments;
  }

  const controlPoints = ordered.orderedPoints.map((point) => {
    const projected = projectPointToPlane(point, effectivePlane);
    return new THREE.Vector3(projected[0], projected[1], projected[2]);
  });

  if (controlPoints.length < 2) return [];
  if (controlPoints.length === 2) {
    return buildPolylineSegments(controlPoints.map((point) => [point.x, point.y, point.z]), false);
  }

  const curve = new THREE.CatmullRomCurve3(controlPoints, closed, 'centripetal', 0.5);
  const smoothPoints = curve.getPoints(Math.max(sampleCount, controlPoints.length * 2)).map((point) => {
    const projected = projectPointToPlane([point.x, point.y, point.z], effectivePlane);
    return [projected[0], projected[1], projected[2]];
  });

  return buildPolylineSegments(smoothPoints, closed);
}

function buildIntersectionLineSegments(points: number[][], curveType: string) {
  const groups = splitIntersectionComponents(points, curveType);
  const normalizedCurveType = curveType.toLowerCase();
  const segments: number[][][] = [];

  for (const group of groups) {
    const zValues = group.map((point) => point[2]);
    const zSpread = Math.max(...zValues) - Math.min(...zValues);
    const avgZ = zValues.reduce((sum, value) => sum + value, 0) / Math.max(zValues.length, 1);
    const plane = zSpread < 0.12 ? { a: 0, b: 0, c: 1, d: -avgZ } : estimatePlaneFromPoints(group);
    segments.push(...buildSmoothCurveSegments(group, plane, {
      closedHint: normalizedCurveType.includes('окруж') || normalizedCurveType.includes('эллипс'),
      circleHint: normalizedCurveType.includes('окруж'),
      sampleCount: 132,
    }));
  }

  return segments;
}

function compute2DSectionAnalysis(section: SectionData | null): Plot2DAnalysis | null {
  if (!section || section.points.length < 2) return null;
  const simplifiedPoints = simplifyPointSet(section.points, 160);
  if (simplifiedPoints.length < 2) return null;

  let projected: [number, number][] = [];

  if (Math.abs(section.plane.c) > 0.999 && Math.abs(section.plane.a) < 1e-8 && Math.abs(section.plane.b) < 1e-8) {
    projected = simplifiedPoints.map((point) => [point[0], point[1]]);
  } else {
    const basis = buildPlaneBasis(section.plane);
    if (!basis) return null;
    const anchor = simplifiedPoints[0];
    const anchorVec = new THREE.Vector3(anchor[0], anchor[1], anchor[2]);
    projected = simplifiedPoints.map((point) => {
      const delta = new THREE.Vector3(point[0], point[1], point[2]).sub(anchorVec);
      return [delta.dot(basis.u), delta.dot(basis.v)];
    });
  }

  const center = projected.reduce<[number, number]>(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
    [0, 0]
  ).map((value) => value / projected.length) as [number, number];

  const ordered = [...projected].sort((a, b) => {
    const angleA = Math.atan2(a[1] - center[1], a[0] - center[0]);
    const angleB = Math.atan2(b[1] - center[1], b[0] - center[0]);
    return angleA - angleB;
  });

  let perimeter = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    const next = ordered[(i + 1) % ordered.length];
    perimeter += Math.hypot(next[0] - current[0], next[1] - current[1]);
  }

  let area = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const [x1, y1] = ordered[i];
    const [x2, y2] = ordered[(i + 1) % ordered.length];
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2;

  let diameter = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      diameter = Math.max(diameter, Math.hypot(ordered[j][0] - ordered[i][0], ordered[j][1] - ordered[i][1]));
    }
  }

  const xs = ordered.map((point) => point[0]);
  const ys = ordered.map((point) => point[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);

  const padding = 20;
  const viewBoxSize = 240;
  const scale = Math.max(width, height, 1e-6);
  const svgPoints = ordered.map((point) => {
    const x = ((point[0] - center[0]) / scale) * (viewBoxSize - padding * 2) + viewBoxSize / 2;
    const y = ((point[1] - center[1]) / scale) * (viewBoxSize - padding * 2) + viewBoxSize / 2;
    return `${x.toFixed(2)},${(viewBoxSize - y).toFixed(2)}`;
  });

  return {
    points2d: ordered,
    svgPolyline: svgPoints.join(' '),
    svgPolylines: [],
    width,
    height,
    area,
    perimeter,
    diameter,
    viewBoxSize
  };
}

function multiplyMatrixVector(matrix: number[][], vector: number[]) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function normalizeVector(vector: number[]) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length < 1e-12) return null;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function powerIterateSymmetric(matrix: number[][], seed: number[], orthogonalTo?: number[]) {
  let current = normalizeVector(seed) ?? [1, 0, 0];

  for (let iteration = 0; iteration < 18; iteration += 1) {
    let next = multiplyMatrixVector(matrix, current);
    if (orthogonalTo) {
      const dot = next[0] * orthogonalTo[0] + next[1] * orthogonalTo[1] + next[2] * orthogonalTo[2];
      next = [
        next[0] - dot * orthogonalTo[0],
        next[1] - dot * orthogonalTo[1],
        next[2] - dot * orthogonalTo[2],
      ];
    }

    const normalized = normalizeVector(next);
    if (!normalized) break;
    current = normalized;
  }

  return current;
}

function estimatePlaneFromPoints(points: number[][]): PlaneCoefficients | null {
  if (points.length < 3) return null;

  const centroid = points.reduce<[number, number, number]>(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]],
    [0, 0, 0]
  ).map((value) => value / points.length) as [number, number, number];

  const covariance = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (const point of points) {
    const dx = point[0] - centroid[0];
    const dy = point[1] - centroid[1];
    const dz = point[2] - centroid[2];
    covariance[0][0] += dx * dx;
    covariance[0][1] += dx * dy;
    covariance[0][2] += dx * dz;
    covariance[1][0] += dy * dx;
    covariance[1][1] += dy * dy;
    covariance[1][2] += dy * dz;
    covariance[2][0] += dz * dx;
    covariance[2][1] += dz * dy;
    covariance[2][2] += dz * dz;
  }

  const firstAxis = powerIterateSymmetric(covariance, [1, 0.25, 0.1]);
  const secondAxis = firstAxis ? powerIterateSymmetric(covariance, [0.1, 1, 0.35], firstAxis) : null;
  let normal = firstAxis && secondAxis
    ? new THREE.Vector3(
      firstAxis[1] * secondAxis[2] - firstAxis[2] * secondAxis[1],
      firstAxis[2] * secondAxis[0] - firstAxis[0] * secondAxis[2],
      firstAxis[0] * secondAxis[1] - firstAxis[1] * secondAxis[0]
    )
    : new THREE.Vector3();

  if (normal.lengthSq() < 1e-10) {
    const p0 = new THREE.Vector3(...points[0]);
    for (let i = 1; i < points.length - 1; i += 1) {
      const p1 = new THREE.Vector3(...points[i]);
      for (let j = i + 1; j < points.length; j += 1) {
        const p2 = new THREE.Vector3(...points[j]);
        const v1 = new THREE.Vector3().subVectors(p1, p0);
        const v2 = new THREE.Vector3().subVectors(p2, p0);
        normal = new THREE.Vector3().crossVectors(v1, v2);
        if (normal.lengthSq() > 1e-8) break;
      }
      if (normal.lengthSq() > 1e-8) break;
    }
  }

  if (normal.lengthSq() < 1e-10) return null;
  normal.normalize();
  const d = -(normal.x * centroid[0] + normal.y * centroid[1] + normal.z * centroid[2]);
  return { a: normal.x, b: normal.y, c: normal.z, d };
}

function compute2DPointCloudAnalysis(points: number[][], plane?: PlaneCoefficients | null): Plot2DAnalysis | null {
  if (points.length < 2) return null;

  const effectivePlane = plane ?? estimatePlaneFromPoints(points) ?? { a: 0, b: 0, c: 1, d: 0 };
  const sectionLike: SectionData = {
    planeEquation: 'intersection',
    plane: effectivePlane,
    curveType: 'spatial',
    curveTypeRu: 'Линия пересечения',
    points,
    segments: []
  };

  return compute2DSectionAnalysis(sectionLike);
}

function projectPointsToPlane2D(points: number[][], plane?: PlaneCoefficients | null) {
  if (points.length < 2) return null;

  const effectivePlane = plane ?? estimatePlaneFromPoints(points) ?? { a: 0, b: 0, c: 1, d: 0 };
  if (Math.abs(effectivePlane.c) > 0.999 && Math.abs(effectivePlane.a) < 1e-8 && Math.abs(effectivePlane.b) < 1e-8) {
    return {
      plane: effectivePlane,
      projected: points.map((point) => [point[0], point[1]] as [number, number]),
    };
  }

  const basis = buildPlaneBasis(effectivePlane);
  if (!basis) return null;
  const anchor = new THREE.Vector3(...projectPointToPlane(points[0], effectivePlane));

  return {
    plane: effectivePlane,
    projected: points.map((point) => {
      const projectedPoint = new THREE.Vector3(...projectPointToPlane(point, effectivePlane));
      const delta = projectedPoint.sub(anchor);
      return [delta.dot(basis.u), delta.dot(basis.v)] as [number, number];
    }),
  };
}

function buildSegmentPolylines2D(segments: number[][][], plane?: PlaneCoefficients | null): Plot2DAnalysis | null {
  if (!segments.length) return null;

  const allSegmentPoints = segments.flat();
  const allXs = allSegmentPoints.map((point) => point[0]);
  const allYs = allSegmentPoints.map((point) => point[1]);
  const allZs = allSegmentPoints.map((point) => point[2]);
  const span = Math.max(
    Math.max(...allXs) - Math.min(...allXs),
    Math.max(...allYs) - Math.min(...allYs),
    Math.max(...allZs) - Math.min(...allZs),
    1e-6
  );
  const epsilon = Math.max(span / 180, 1e-4);
  const keyFor = (point: number[]) => point.map((value) => Math.round(value / epsilon)).join(':');
  const pointMap = new Map<string, number[]>();
  const adjacency = new Map<string, string[]>();
  const makeEdgeKey = (a: string, b: string) => [a, b].sort().join('|');

  for (const [start, end] of segments) {
    const startKey = keyFor(start);
    const endKey = keyFor(end);
    pointMap.set(startKey, start);
    pointMap.set(endKey, end);
    adjacency.set(startKey, [...(adjacency.get(startKey) ?? []), endKey]);
    adjacency.set(endKey, [...(adjacency.get(endKey) ?? []), startKey]);
  }

  const effectivePlane = plane ?? estimatePlaneFromPoints(allSegmentPoints) ?? { a: 0, b: 0, c: 1, d: 0 };
  const edgeVisited = new Set<string>();
  const nodes = Array.from(adjacency.keys());
  const startNodes = nodes.filter((key) => (adjacency.get(key)?.length ?? 0) !== 2);
  const orderedPaths: number[][][] = [];

  const walkPath = (startKey: string, nextKey: string) => {
    const pathKeys = [startKey, nextKey];
    edgeVisited.add(makeEdgeKey(startKey, nextKey));

    let prev = startKey;
    let current = nextKey;

    while (true) {
      const neighbors = adjacency.get(current) ?? [];
      const candidates = neighbors.filter((candidate) => candidate !== prev && !edgeVisited.has(makeEdgeKey(current, candidate)));
      if (!candidates.length) break;
      const next = candidates[0];
      edgeVisited.add(makeEdgeKey(current, next));
      pathKeys.push(next);
      prev = current;
      current = next;
    }

    const pathPoints = pathKeys.map((key) => pointMap.get(key)!).filter(Boolean);
    if (pathPoints.length >= 2) {
      orderedPaths.push(deduplicatePoints(pathPoints, epsilon * 0.35));
    }
  };

  for (const startKey of startNodes) {
    for (const nextKey of adjacency.get(startKey) ?? []) {
      const edgeKey = makeEdgeKey(startKey, nextKey);
      if (!edgeVisited.has(edgeKey)) {
        walkPath(startKey, nextKey);
      }
    }
  }

  for (const startKey of nodes) {
    for (const nextKey of adjacency.get(startKey) ?? []) {
      const edgeKey = makeEdgeKey(startKey, nextKey);
      if (!edgeVisited.has(edgeKey)) {
        walkPath(startKey, nextKey);
      }
    }
  }

  const smoothedPaths = orderedPaths.map((pathPoints) => {
    const closedHint = pathPoints.length >= 5 && Math.hypot(
      pathPoints[0][0] - pathPoints[pathPoints.length - 1][0],
      pathPoints[0][1] - pathPoints[pathPoints.length - 1][1],
      pathPoints[0][2] - pathPoints[pathPoints.length - 1][2],
    ) < epsilon * 3;

    const controlPoints = pathPoints.map((point) => {
      const projected = projectPointToPlane(point, effectivePlane);
      return new THREE.Vector3(projected[0], projected[1], projected[2]);
    });

    if (controlPoints.length < 2) return pathPoints;
    if (controlPoints.length === 2) {
      return controlPoints.map((point) => [point.x, point.y, point.z]);
    }

    const curve = new THREE.CatmullRomCurve3(controlPoints, closedHint, 'centripetal', 0.5);
    return curve
      .getPoints(Math.max(120, controlPoints.length * 3))
      .map((point) => {
        const projected = projectPointToPlane([point.x, point.y, point.z], effectivePlane);
        return [projected[0], projected[1], projected[2]];
      });
  }).filter((path) => path.length >= 2);

  const flattenedPoints = deduplicatePoints(smoothedPaths.flat(), epsilon * 0.35);
  const baseAnalysis = compute2DPointCloudAnalysis(flattenedPoints, effectivePlane);
  const projectedAll = projectPointsToPlane2D(flattenedPoints, effectivePlane);
  if (!baseAnalysis || !projectedAll) return null;

  const center = projectedAll.projected.reduce<[number, number]>(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
    [0, 0]
  ).map((value) => value / projectedAll.projected.length) as [number, number];
  const projectedXs = projectedAll.projected.map((point) => point[0]);
  const projectedYs = projectedAll.projected.map((point) => point[1]);
  const padding = 20;
  const scale = Math.max(
    Math.max(...projectedXs) - Math.min(...projectedXs),
    Math.max(...projectedYs) - Math.min(...projectedYs),
    1e-6
  );

  const svgPolylines = smoothedPaths.map((path) => {
    const projectedPath = projectPointsToPlane2D(path, projectedAll.plane);
    if (!projectedPath) return '';
    return projectedPath.projected.map((point) => {
      const x = ((point[0] - center[0]) / scale) * (baseAnalysis.viewBoxSize - padding * 2) + baseAnalysis.viewBoxSize / 2;
      const y = ((point[1] - center[1]) / scale) * (baseAnalysis.viewBoxSize - padding * 2) + baseAnalysis.viewBoxSize / 2;
      return `${x.toFixed(2)},${(baseAnalysis.viewBoxSize - y).toFixed(2)}`;
    }).join(' ');
  }).filter(Boolean);

  return {
    ...baseAnalysis,
    svgPolylines,
  };
}

function splitSegmentComponents(segments: number[][][]) {
  if (!segments.length) return [];

  const allPoints = segments.flat();
  const xs = allPoints.map((point) => point[0]);
  const ys = allPoints.map((point) => point[1]);
  const zs = allPoints.map((point) => point[2]);
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
    1e-6
  );
  const epsilon = Math.max(span / 180, 1e-4);
  const keyFor = (point: number[]) => point.map((value) => Math.round(value / epsilon)).join(':');
  const pointToSegments = new Map<string, number[]>();

  segments.forEach((segment, index) => {
    if (segment.length < 2) return;
    for (const point of segment) {
      const key = keyFor(point);
      pointToSegments.set(key, [...(pointToSegments.get(key) ?? []), index]);
    }
  });

  const visited = new Set<number>();
  const components: number[][][][] = [];

  for (let index = 0; index < segments.length; index += 1) {
    if (visited.has(index)) continue;
    const stack = [index];
    const component: number[][][] = [];
    visited.add(index);

    while (stack.length) {
      const current = stack.pop()!;
      const segment = segments[current];
      component.push(segment);

      for (const point of segment) {
        const neighbors = pointToSegments.get(keyFor(point)) ?? [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            stack.push(neighbor);
          }
        }
      }
    }

    if (component.length) {
      components.push(component);
    }
  }

  return components;
}

function buildIntersectionComponentDisplay(
  segments: number[][][],
  label: string
): {
  label: string;
  planeLabel: string;
  analysis: Plot2DAnalysis;
  displayShape: 'circle' | 'polyline';
} | null {
  if (!segments.length) return null;
  const points = deduplicatePoints(segments.flat(), 1e-4);
  if (points.length < 2) return null;

  const zValues = points.map((point) => point[2]);
  const avgZ = zValues.reduce((sum, value) => sum + value, 0) / zValues.length;
  const zSpread = Math.max(...zValues) - Math.min(...zValues);
  if (zSpread < 0.18 && points.length >= 8) {
    const centerX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const centerY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    const radii = points.map((point) => Math.hypot(point[0] - centerX, point[1] - centerY));
    const averageRadius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
    const radiusDeviation = averageRadius > 1e-6
      ? Math.sqrt(radii.reduce((sum, value) => sum + (value - averageRadius) ** 2, 0) / radii.length) / averageRadius
      : Number.POSITIVE_INFINITY;
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const aspect = Math.min(width, height) / Math.max(width, height, 1e-6);

    if (averageRadius > 1e-6 && radiusDeviation < 0.16 && aspect > 0.82) {
      return {
        label,
        planeLabel: `z = ${avgZ.toFixed(3)}`,
        analysis: buildCircleDisplayAnalysis(averageRadius),
        displayShape: 'circle',
      };
    }
  }

  const plane = zSpread < 0.18 ? { a: 0, b: 0, c: 1, d: -avgZ } : estimatePlaneFromPoints(points);
  const analysis = buildSegmentPolylines2D(segments, plane);
  if (!analysis) return null;

  return {
    label,
    planeLabel: zSpread < 0.18 ? `z = ${avgZ.toFixed(3)}` : 'Собственная плоскость проекции',
    analysis,
    displayShape: 'polyline',
  };
}

function splitSegmentsByZBands(segments: number[][][]) {
  if (!segments.length) return [];

  const annotated = segments.map((segment) => ({
    segment,
    z: (segment[0][2] + segment[1][2]) / 2,
  })).sort((a, b) => a.z - b.z);

  const zSpan = annotated[annotated.length - 1].z - annotated[0].z;
  if (zSpan < 0.2) return [segments];

  let bestGap = 0;
  let bestIndex = -1;
  for (let i = 0; i < annotated.length - 1; i += 1) {
    const gap = annotated[i + 1].z - annotated[i].z;
    if (gap > bestGap) {
      bestGap = gap;
      bestIndex = i;
    }
  }

  if (bestIndex < 0 || bestGap < Math.max(0.2, zSpan * 0.24)) {
    return [segments];
  }

  const lower = annotated.slice(0, bestIndex + 1).map((item) => item.segment);
  const upper = annotated.slice(bestIndex + 1).map((item) => item.segment);
  const groups = [lower, upper].filter((group) => group.length >= 8);
  return groups.length >= 2 ? groups : [segments];
}

type Plot2DAnalysis = {
  points2d?: [number, number][];
  svgPolyline: string;
  svgPolylines?: string[];
  width: number;
  height: number;
  area: number;
  perimeter: number;
  diameter: number;
  viewBoxSize: number;
};

function buildCircleDisplayAnalysis(radius: number): Plot2DAnalysis {
  const safeRadius = Math.max(radius, 1e-6);
  return {
    svgPolyline: '',
    svgPolylines: [],
    width: safeRadius * 2,
    height: safeRadius * 2,
    area: Math.PI * safeRadius * safeRadius,
    perimeter: 2 * Math.PI * safeRadius,
    diameter: safeRadius * 2,
    viewBoxSize: 240,
  };
}

type AxisProjectionView = {
  label: 'XY' | 'XZ' | 'YZ';
  analysis: Plot2DAnalysis;
  displayShape: 'circle' | 'polyline';
};

function buildAxisProjectionAnalysis(
  points: number[][],
  segments: number[][][] | undefined,
  axes: [number, number]
): Plot2DAnalysis | null {
  const projectPoint = (point: number[]) => [point[axes[0]], point[axes[1]], 0];

  if (segments?.length) {
    const projectedSegments = segments
      .filter((segment) => segment.length >= 2)
      .map((segment) => [projectPoint(segment[0]), projectPoint(segment[1])]);
    if (projectedSegments.length) {
      return buildSegmentPolylines2D(projectedSegments, { a: 0, b: 0, c: 1, d: 0 });
    }
  }

  const projectedPoints = points.map(projectPoint);
  if (projectedPoints.length < 2) return null;
  return compute2DPointCloudAnalysis(projectedPoints, { a: 0, b: 0, c: 1, d: 0 });
}

function buildAxisProjectionViews(points: number[][], segments?: number[][][]) {
  const views: AxisProjectionView[] = [];
  const definitions: Array<{ label: 'XY' | 'XZ' | 'YZ'; axes: [number, number] }> = [
    { label: 'XY', axes: [0, 1] },
    { label: 'XZ', axes: [0, 2] },
    { label: 'YZ', axes: [1, 2] },
  ];

  for (const definition of definitions) {
    const analysis = buildAxisProjectionAnalysis(points, segments, definition.axes);
    if (analysis) {
      views.push({
        label: definition.label,
        analysis,
        displayShape: 'polyline',
      });
    }
  }

  return views;
}

function parseZLevelsFromText(...texts: string[]) {
  const joined = texts.join(' ');
  const levels: number[] = [];

  const plusMinusMatch = joined.match(/z\s*=\s*±\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (plusMinusMatch) {
    const value = Number(plusMinusMatch[1]);
    if (Number.isFinite(value)) {
      levels.push(-value, value);
    }
  }

  const directMatches = joined.matchAll(/z\s*=\s*([+-]?[0-9]+(?:\.[0-9]+)?)/gi);
  for (const match of directMatches) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) levels.push(value);
  }

  return Array.from(new Set(levels.map((value) => Number(value.toFixed(3))))).sort((a, b) => a - b);
}

function buildIdealIntersection2DComponents(
  systemAnalysis: SystemAnalysisResponse | null,
  resolvedSummary: { formula: string; detail: string; radius: number | null }
) {
  const curveType = systemAnalysis?.curve_type?.toLowerCase() ?? '';
  const joinedSteps = systemAnalysis?.solutions?.join(' ') ?? '';
  const levels = parseZLevelsFromText(resolvedSummary.formula, resolvedSummary.detail, joinedSteps);
  const radius = systemAnalysis?.radius ?? resolvedSummary.radius;

  if (!Number.isFinite(radius ?? NaN)) return null;

  if (curveType.includes('две окружности') || levels.length === 2) {
    const finalLevels = levels.length >= 2 ? levels.slice(0, 2) : [-1, 1];
    return finalLevels.map((level, index) => ({
      label: index === 0 ? 'Нижняя окружность' : 'Верхняя окружность',
      planeLabel: `z = ${level.toFixed(3)}`,
      analysis: buildCircleDisplayAnalysis(radius!),
      displayShape: 'circle' as const,
    }));
  }

  if (curveType.includes('окруж')) {
    return [{
      label: 'Пересечение',
      planeLabel: levels.length ? `z = ${levels[0].toFixed(3)}` : 'Плоскость сечения',
      analysis: buildCircleDisplayAnalysis(radius!),
      displayShape: 'circle' as const,
    }];
  }

  return null;
}

function computeSectionDisplayAnalysis(section: SectionData | null): Plot2DAnalysis | null {
  if (!section) return null;
  if (section.segments.length > 0) {
    return buildSegmentPolylines2D(section.segments, section.plane) ?? compute2DSectionAnalysis(section);
  }
  return compute2DSectionAnalysis(section);
}

function buildXYIntersectionContour(surfaceA: Surface, surfaceB: Surface, resolution = 140) {
  const explicitSurface = surfaceA.detectedType === 'explicit'
    ? surfaceA
    : surfaceB.detectedType === 'explicit'
      ? surfaceB
      : null;

  try {
    let valueAt: ((x: number, y: number) => number) | null = null;
    let zAt: ((x: number, y: number) => number) | null = null;

    if (surfaceA.detectedType === 'explicit' && surfaceB.detectedType === 'explicit') {
      const exprA = surfaceA.equation.replace(/^z\s*=\s*/i, '').trim();
      const exprB = surfaceB.equation.replace(/^z\s*=\s*/i, '').trim();
      const fnA = compileNumericExpression(exprA, ['x', 'y']);
      const fnB = compileNumericExpression(exprB, ['x', 'y']);

      valueAt = (x: number, y: number) => Number(fnA(x, y)) - Number(fnB(x, y));
      zAt = (x: number, y: number) => {
        const za = Number(fnA(x, y));
        const zb = Number(fnB(x, y));
        if (Number.isFinite(za) && Number.isFinite(zb)) return (za + zb) / 2;
        return Number.isFinite(za) ? za : zb;
      };
    } else if (explicitSurface) {
      const expr = explicitSurface.equation.replace(/^z\s*=\s*/i, '').trim();
      const explicitFn = compileNumericExpression(expr, ['x', 'y']);
      const implicitSurface = explicitSurface.id === surfaceA.id ? surfaceB : surfaceA;
      const implicitResidual = createSurfaceResidual(implicitSurface);
      if (!implicitResidual) return null;

      valueAt = (x: number, y: number) => {
        const z = Number(explicitFn(x, y));
        if (!Number.isFinite(z)) return NaN;
        return Number(implicitResidual([x, y, z]));
      };
      zAt = (x: number, y: number) => Number(explicitFn(x, y));
    } else {
      return null;
    }

    if (!valueAt || !zAt) return null;

    const xMin = Math.max(surfaceA.bounds.x_min, surfaceB.bounds.x_min);
    const xMax = Math.min(surfaceA.bounds.x_max, surfaceB.bounds.x_max);
    const yMin = Math.max(surfaceA.bounds.y_min, surfaceB.bounds.y_min);
    const yMax = Math.min(surfaceA.bounds.y_max, surfaceB.bounds.y_max);
    if (!(xMax > xMin && yMax > yMin)) return null;

    const dx = (xMax - xMin) / resolution;
    const dy = (yMax - yMin) / resolution;
    const segments2D: number[][][] = [];
    const segments3D: number[][][] = [];

    for (let i = 0; i < resolution; i += 1) {
      for (let j = 0; j < resolution; j += 1) {
        const x0 = xMin + i * dx;
        const x1 = x0 + dx;
        const y0 = yMin + j * dy;
        const y1 = y0 + dy;

        const p00 = [x0, y0, 0];
        const p10 = [x1, y0, 0];
        const p11 = [x1, y1, 0];
        const p01 = [x0, y1, 0];

        const v00 = valueAt(x0, y0);
        const v10 = valueAt(x1, y0);
        const v11 = valueAt(x1, y1);
        const v01 = valueAt(x0, y1);

        if (![v00, v10, v11, v01].every(Number.isFinite)) continue;

        const triangles = [
          { triangle: [p00, p10, p11], values: [v00, v10, v11] },
          { triangle: [p00, p11, p01], values: [v00, v11, v01] },
        ];

        for (const { triangle, values } of triangles) {
          const hits = collectIsoPointsFromTriangle(triangle, values);
          if (hits.length >= 2) {
            const start2D = [hits[0][0], hits[0][1], 0];
            const end2D = [hits[1][0], hits[1][1], 0];
            const startZ = zAt(start2D[0], start2D[1]);
            const endZ = zAt(end2D[0], end2D[1]);
            if (!Number.isFinite(startZ) || !Number.isFinite(endZ)) continue;

            const start3D = refineIntersectionPoint(surfaceA, surfaceB, [start2D[0], start2D[1], startZ]);
            const end3D = refineIntersectionPoint(surfaceA, surfaceB, [end2D[0], end2D[1], endZ]);
            segments2D.push([start2D, end2D]);
            segments3D.push([start3D, end3D]);
          }
        }
      }
    }

    const epsilon = Math.max(dx, dy) * 0.4;
    const cleaned2D = deduplicateSegments(segments2D, epsilon);
    const cleaned3D = deduplicateSegments(segments3D, epsilon);
    const analysis = buildSegmentPolylines2D(cleaned2D, { a: 0, b: 0, c: 1, d: 0 });
    if (!analysis) return null;

    return {
      segments2D: cleaned2D,
      segments3D: cleaned3D,
      analysis,
    };
  } catch (error) {
    console.warn('Не удалось построить контур пересечения в плоскости Oxy', error);
    return null;
  }
}

function splitIntersectionComponents(points: number[][], curveType: string) {
  if (points.length < 2) return [];
  const sorted = [...points].sort((a, b) => a[2] - b[2]);
  const zMin = sorted[0][2];
  const zMax = sorted[sorted.length - 1][2];
  const zSpan = zMax - zMin;

  if (zSpan > 1e-3) {
    let bestSplitIndex = -1;
    let bestGap = 0;

    for (let i = 0; i < sorted.length - 1; i += 1) {
      const gap = sorted[i + 1][2] - sorted[i][2];
      if (gap > bestGap) {
        bestGap = gap;
        bestSplitIndex = i;
      }
    }

    const shouldSplitByZ =
      curveType.toLowerCase().includes('две окружности') ||
      bestGap > Math.max(zSpan * 0.22, 0.18);

    if (shouldSplitByZ && bestSplitIndex >= 1 && bestSplitIndex < sorted.length - 2) {
      const lower = sorted.slice(0, bestSplitIndex + 1);
      const upper = sorted.slice(bestSplitIndex + 1);
      const candidateGroups = [lower, upper].filter((group) => group.length >= 4);
      if (candidateGroups.length >= 2) {
        return candidateGroups;
      }
    }

    if (curveType.toLowerCase().includes('две окружности')) {
      const mid = (zMin + zMax) / 2;
      const lower = sorted.filter((point) => point[2] <= mid);
      const upper = sorted.filter((point) => point[2] > mid);
      const candidateGroups = [lower, upper].filter((group) => group.length >= 4);
      if (candidateGroups.length) {
        return candidateGroups;
      }
    }
  }

  return [points];
}

function inferCurveTypeFrom2D(analysis: Plot2DAnalysis | null) {
  if (!analysis) return { type: 'неизвестная кривая', note: '', radius: null as number | null };
  const ratio = analysis.width > 1e-6 ? analysis.height / analysis.width : 1;
  const radiusFromArea = Math.sqrt(Math.max(analysis.area, 0) / Math.PI);
  const radiusFromDiameter = analysis.diameter / 2;
  const isClosed = analysis.area > 1e-3 && analysis.perimeter > 1e-3;
  const closeToCircle = Math.abs(ratio - 1) < 0.12 && Math.abs(radiusFromArea - radiusFromDiameter) < 0.25;
  if (isClosed && closeToCircle) {
    return { type: 'Окружность', note: `Радиус ≈ ${radiusFromDiameter.toFixed(3)}`, radius: radiusFromDiameter };
  }
  if (isClosed) {
    return { type: 'Эллипс / замкнутая кривая', note: `Большая ось ≈ ${analysis.diameter.toFixed(3)}`, radius: null };
  }
  return { type: 'Открытая кривая', note: `Протяжённость ≈ ${analysis.diameter.toFixed(3)}`, radius: null };
}

function analyzeSectionSummary(surface: Surface | undefined, planeLabel: string, analysis: Plot2DAnalysis | null) {
  const inferred = inferCurveTypeFrom2D(analysis);
  if (!surface || !analysis) {
    return {
      title: 'Сечение не построено',
      type: '—',
      equation: '—',
      detail: 'Постройте сечение или линию уровня, чтобы получить распознавание.',
      radius: null as number | null,
    };
  }

  const eq = surface.equation.replace(/\s+/g, '').toLowerCase();
  const explicitExpr = surface.detectedType === 'explicit'
    ? surface.equation.replace(/^z\s*=\s*/i, '').replace(/\s+/g, '').toLowerCase()
    : eq;
  let equation = 'Численно определено по точкам сечения';
  let detail = inferred.note;
  let radius = inferred.radius;

  const zMatch = planeLabel.match(/z\s*=\s*(-?\d+(\.\d+)?)/i);
  const xMatch = planeLabel.match(/x\s*=\s*(-?\d+(\.\d+)?)/i);
  const yMatch = planeLabel.match(/y\s*=\s*(-?\d+(\.\d+)?)/i);
  const planeValue = zMatch ? Number(zMatch[1]) : null;
  const xValue = xMatch ? Number(xMatch[1]) : null;
  const yValue = yMatch ? Number(yMatch[1]) : null;

  if (eq.includes('x^2+y^2+z^2=9') && planeValue !== null) {
    const r2 = 9 - planeValue * planeValue;
    if (r2 > 0) {
      radius = Math.sqrt(r2);
      equation = `x² + y² = ${r2.toFixed(3)}`;
      detail = `Окружность в плоскости ${planeLabel}`;
      return { title: `Сечение ${planeLabel}`, type: 'Окружность', equation, detail, radius };
    }
  }

  if (eq.includes('x^2+y^2=4') && planeValue !== null) {
    equation = 'x² + y² = 4';
    radius = 2;
    detail = `Горизонтальное сечение цилиндра в плоскости ${planeLabel}`;
    return { title: `Сечение ${planeLabel}`, type: 'Окружность', equation, detail, radius };
  }

  if (eq.includes('x^2+y^2=z^2') && planeValue !== null) {
    const r2 = planeValue * planeValue;
    equation = `x² + y² = ${r2.toFixed(3)}`;
    radius = Math.abs(planeValue);
    detail = `Сечение конуса плоскостью ${planeLabel}`;
    return { title: `Сечение ${planeLabel}`, type: 'Окружность', equation, detail, radius };
  }

  if (eq.includes('x^2-y^2') && planeValue !== null) {
    equation = `x² - y² = ${planeValue.toFixed(3)}`;
    detail = 'Гипербола для горизонтального сечения седловой поверхности';
    return { title: `Сечение ${planeLabel}`, type: 'Гипербола', equation, detail, radius: null };
  }

  if (explicitExpr.includes('x^2+y^2') && planeValue !== null) {
    if (planeValue >= 0) {
      equation = `x² + y² = ${planeValue.toFixed(3)}`;
      radius = Math.sqrt(planeValue);
      detail = 'Окружность как линия уровня параболоида';
      return { title: `Линия уровня ${planeLabel}`, type: 'Окружность', equation, detail, radius };
    }
    equation = `x² + y² = ${planeValue.toFixed(3)}`;
    detail = 'При отрицательном уровне действительных точек нет';
  }

  if (explicitExpr.includes('x^2+y^2') && (xValue !== null || yValue !== null)) {
    const sectionValue = xValue !== null ? xValue : yValue ?? 0;
    const constant = sectionValue * sectionValue;
    equation = xValue !== null
      ? `z = y² + ${constant.toFixed(3)}`
      : `z = x² + ${constant.toFixed(3)}`;
    detail = 'Вертикальное сечение эллиптического параболоида даёт параболу.';
    return { title: `Сечение ${planeLabel}`, type: 'Парабола', equation, detail, radius: null };
  }

  if (explicitExpr.includes('x^2-y^2') && (xValue !== null || yValue !== null)) {
    const verticalValue = xValue !== null ? xValue : yValue ?? 0;
    equation = xValue !== null
      ? `z = ${xValue.toFixed(3)}² - y²`
      : `z = x² - ${verticalValue.toFixed(3)}²`;
    detail = 'Вертикальное сечение седловой поверхности даёт параболу.';
    return { title: `Сечение ${planeLabel}`, type: 'Парабола', equation, detail, radius: null };
  }

  return {
    title: `Сечение ${planeLabel}`,
    type: inferred.type,
    equation,
    detail,
    radius,
  };
}

function summarizeSurfaceIntersection(surfaces: Surface[], intersectionPoints: IntersectionPoint[]) {
  if (surfaces.length < 2) {
    return {
      title: 'Система уравнений',
      formula: 'Добавьте хотя бы две поверхности.',
      detail: 'После этого система покажет численную линию пересечения.',
      radius: null as number | null,
    };
  }

  const [a, b] = surfaces;
  const normalizeEquation = (value: string) => value.toLowerCase().replace(/\s+/g, '');
  const parseExplicitConstant = (surface: Surface) => {
    if (surface.detectedType !== 'explicit') return null;
    const expression = surface.equation.replace(/^z\s*=\s*/i, '').trim();
    const numericValue = Number(expression);
    return Number.isFinite(numericValue) ? numericValue : null;
  };
  const explicitPlaneA = parseExplicitConstant(a);
  const explicitPlaneB = parseExplicitConstant(b);
  const implicitSurface = a.detectedType === 'implicit' ? a : b.detectedType === 'implicit' ? b : null;
  const explicitPlaneValue = explicitPlaneA ?? explicitPlaneB;
  const implicitEquation = implicitSurface ? normalizeEquation(implicitSurface.equation) : '';

  if (implicitSurface && explicitPlaneValue !== null) {
    if (implicitEquation.includes('x^2+y^2=4') || implicitEquation.includes('x²+y²=4')) {
      return {
        title: 'Пересечение двух поверхностей',
        formula: `x² + y² = 4, z = ${explicitPlaneValue}`,
        detail: `Получается окружность радиуса 2.000 в плоскости z = ${explicitPlaneValue}.`,
        radius: 2,
      };
    }
    if (implicitEquation.includes('x^2+y^2=z^2') || implicitEquation.includes('x²+y²=z²')) {
      const radius = Math.abs(explicitPlaneValue);
      return {
        title: 'Пересечение двух поверхностей',
        formula: `x² + y² = ${explicitPlaneValue ** 2}, z = ${explicitPlaneValue}`,
        detail: `Горизонтальное сечение конуса даёт окружность радиуса ${radius.toFixed(3)}.`,
        radius,
      };
    }
    const sphereMatch = implicitEquation.match(/x\^2\+y\^2\+z\^2=([0-9.]+)/);
    if (sphereMatch) {
      const radiusSquared = Number(sphereMatch[1]);
      const sectionSquared = radiusSquared - explicitPlaneValue ** 2;
      if (sectionSquared > 0) {
        const radius = Math.sqrt(sectionSquared);
        return {
          title: 'Пересечение двух поверхностей',
          formula: `x² + y² = ${sectionSquared.toFixed(3)}, z = ${explicitPlaneValue}`,
          detail: `Получается окружность радиуса ${radius.toFixed(3)} в плоскости z = ${explicitPlaneValue}.`,
          radius,
        };
      }
      if (Math.abs(sectionSquared) < 1e-8) {
        return {
          title: 'Пересечение двух поверхностей',
          formula: `x = 0, y = 0, z = ${explicitPlaneValue}`,
          detail: 'Плоскость касается сферы в одной точке.',
          radius: 0,
        };
      }
    }
  }

  if (a.detectedType === 'explicit' && b.detectedType === 'explicit') {
    const eq1 = a.equation.replace(/^z\s*=\s*/i, '').trim();
    const eq2 = b.equation.replace(/^z\s*=\s*/i, '').trim();
    const numericSecond = Number(eq2);
    const numericFirst = Number(eq1);

    if (!Number.isNaN(numericSecond) && /x\^2\s*\+\s*y\^2/i.test(eq1)) {
      const radius = Math.sqrt(Math.max(numericSecond, 0));
      return {
        title: 'Пересечение двух поверхностей',
        formula: `${eq1} = ${numericSecond}  =>  x² + y² = ${numericSecond}`,
        detail: `Получается окружность радиуса ${radius.toFixed(3)}.`,
        radius,
      };
    }
    if (!Number.isNaN(numericFirst) && /x\^2\s*\+\s*y\^2/i.test(eq2)) {
      const radius = Math.sqrt(Math.max(numericFirst, 0));
      return {
        title: 'Пересечение двух поверхностей',
        formula: `${eq2} = ${numericFirst}  =>  x² + y² = ${numericFirst}`,
        detail: `Получается окружность радиуса ${radius.toFixed(3)}.`,
        radius,
      };
    }

    return {
      title: 'Пересечение двух поверхностей',
      formula: `${eq1} = ${eq2}`,
      detail: `Найдено численных точек/фрагментов пересечения: ${intersectionPoints.length}.`,
      radius: null,
    };
  }

  return {
    title: 'Пересечение двух поверхностей',
    formula: `${a.equation} ∩ ${b.equation}`,
    detail: `Найдено численных точек/фрагментов пересечения: ${intersectionPoints.length}.`,
    radius: null,
  };
}

function explainSystemIntersection(
  surfaces: Surface[],
  systemAnalysis: SystemAnalysisResponse | null,
  fallback: { detail: string }
) {
  if (surfaces.length < 2) {
    return 'Сначала постройте две поверхности, чтобы система могла объяснить их пересечение.';
  }

  const [a, b] = surfaces;
  const equationA = a.equation;
  const equationB = b.equation;
  const curveType = systemAnalysis?.curve_type?.toLowerCase() ?? '';

  if (curveType.includes('две окружности')) {
    return `Одна поверхность сначала фиксирует радиус окружности в плоскости Oxy, а вторая после подстановки определяет два допустимых уровня по z: верхний и нижний. Поэтому пересечение состоит не из одной, а из двух симметричных окружностей.`;
  }

  if (curveType.includes('нет действительных решений')) {
    return `После подстановки одной поверхности в другую получается противоречие или отрицательное значение для квадрата координаты. Это означает, что в действительном пространстве поверхности не пересекаются.`;
  }

  if (curveType.includes('окруж')) {
    return `Обе поверхности одновременно выполняются только в точках одной окружности. Обычно это происходит, когда одна поверхность задаёт тело вращения или цилиндр, а вторая фиксирует конкретный уровень, например плоскость z = const. Тогда из системы остаётся условие вида x² + y² = const, а оно и описывает окружность.`;
  }

  if (curveType.includes('эллипс')) {
    return `Пересечение оказалось замкнутой коникой. Это значит, что после подстановки одного уравнения в другое остаётся квадратичное уравнение без смены знака у квадратов, поэтому линия пересечения имеет форму эллипса.`;
  }

  if (curveType.includes('гипербол')) {
    return `После исключения одной переменной в уравнении сечения остаются квадраты с разными знаками. Именно такой знакосменный квадратичный закон и даёт гиперболу, поэтому линия пересечения распадается на две ветви.`;
  }

  if (curveType.includes('парабол')) {
    return `Система после преобразований сводится к квадратичному уравнению с вырожденным дискриминантом. В таком случае одна из переменных входит линейно, а другая квадратично, поэтому линия пересечения имеет форму параболы.`;
  }

  if (curveType.includes('пряма')) {
    return `Обе поверхности совпадают вдоль линейного набора точек. Это значит, что система ограничивает пространство не замкнутой кривой, а прямой или набором прямых образующих.`;
  }

  if (systemAnalysis?.solutions?.length) {
    return `Система была преобразована пошагово: ${systemAnalysis.solutions.join(' -> ')}. По итоговому уравнению определяется форма линии пересечения и её геометрический смысл.`;
  }

  return `Система не свелась к простому учебному шаблону, поэтому приложение показывает численную линию пересечения. Для уравнений ${equationA} и ${equationB} ориентируйтесь на итоговую формулу и пространственную кривую на сцене. ${fallback.detail}`;
}

function buildLineGeometry(segments: number[][][] | undefined, sampleLimit = 400) {
  if (!segments || segments.length === 0) return null;

  const stride = Math.max(1, Math.ceil(segments.length / sampleLimit));
  const sampledSegments = segments.filter((_, index) => index % stride === 0);
  const positions = new Float32Array(sampledSegments.length * 2 * 3);

  sampledSegments.forEach((segment, index) => {
    const [start, end] = segment;
    const base = index * 6;
    positions[base] = start[0];
    positions[base + 1] = start[2];
    positions[base + 2] = start[1];
    positions[base + 3] = end[0];
    positions[base + 4] = end[2];
    positions[base + 5] = end[1];
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function buildPointGeometry(points: number[][] | undefined, sampleLimit = 120) {
  const sampledPoints = simplifyPointSet(points, sampleLimit);
  if (sampledPoints.length === 0) return null;
  const positions = new Float32Array(sampledPoints.length * 3);

  sampledPoints.forEach((point, index) => {
    positions[index * 3] = point[0];
    positions[index * 3 + 1] = point[2];
    positions[index * 3 + 2] = point[1];
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function classifySurface(surface?: Surface) {
  if (!surface) {
    return { label: 'Не выбрано', order: '—', note: 'Выберите поверхность для анализа классификации.', specialPoints: [] as number[][], ruledSegments: [] as number[][][] };
  }

  const eq = surface.equation.toLowerCase().replace(/\s+/g, '');
  let label = 'Поверхность общего вида';
  let note = 'Классификация получена эвристически по виду уравнения.';
  const specialPoints: number[][] = [];
  const ruledSegments: number[][][] = [];

  if (eq.includes('x^2+y^2+z^2')) label = 'Сфера / эллипсоид вращения';
  else if (eq.includes('x^2/4+y^2/9+z^2/16')) label = 'Эллипсоид';
  else if (eq.includes('x^2+y^2=z^2')) {
    label = 'Конус';
    note = 'Конус имеет особую точку в вершине и является линейчатой поверхностью.';
    specialPoints.push([0, 0, 0]);
    for (const t of [-2, -1, 1, 2]) {
      ruledSegments.push([[-3, -3 * t, 3], [3, 3 * t, 3]]);
      ruledSegments.push([[-3, 3 * t, -3], [3, -3 * t, -3]]);
    }
  } else if (eq.includes('x^2+y^2=4')) {
    label = 'Круговой цилиндр';
    note = 'Цилиндр является линейчатой поверхностью; образующие параллельны оси z.';
    for (const angle of [0, Math.PI / 3, 2 * Math.PI / 3, Math.PI]) {
      const x = 2 * Math.cos(angle);
      const y = 2 * Math.sin(angle);
      ruledSegments.push([[x, y, -3], [x, y, 3]]);
    }
  } else if (eq.includes('x^2-y^2')) {
    label = 'Гиперболический параболоид';
    note = 'Седловая поверхность и классический пример линейчатой поверхности.';
    ruledSegments.push([[-3, -3, 0], [3, 3, 0]]);
    ruledSegments.push([[-3, 3, 0], [3, -3, 0]]);
  } else if (eq.includes('x^2+y^2') && !eq.includes('=') && !eq.includes('z')) {
    label = 'Эллиптический параболоид';
  } else if (eq.includes('-z^2=1') || eq.includes('x^2+y^2-z^2=1')) {
    label = 'Однополостный гиперболоид';
    note = 'Однополостный гиперболоид является линейчатой поверхностью.';
    ruledSegments.push([[-2, -1, -2], [2, 1, 2]]);
    ruledSegments.push([[-2, 1, -2], [2, -1, 2]]);
  } else if (eq.includes('-z^2=-1') || eq.includes('x^2+y^2-z^2=-1')) {
    label = 'Двуполостный гиперболоид';
  }

  const exponents = [...surface.equation.matchAll(/\^(\d+)/g)].map((match) => Number(match[1]));
  const order = exponents.length > 0 ? String(Math.max(...exponents)) : '1';

  return { label, order, note, specialPoints, ruledSegments };
}

function buildExplicitGradientColors(surface?: Surface) {
  if (!surface?.data?.normals || surface.detectedType !== 'explicit') return null;

  const magnitudes = surface.data.normals.map((normal) => {
    const nz = Math.abs(normal[2]) < 1e-6 ? 1e-6 : normal[2];
    const fx = -normal[0] / nz;
    const fy = -normal[1] / nz;
    return Math.sqrt(fx * fx + fy * fy);
  });

  return buildValueColors(magnitudes);
}

function buildImplicitGradientColors(surface?: Surface) {
  if (!surface?.data || surface.detectedType !== 'implicit') return null;

  const residual = createSurfaceResidual(surface);
  if (!residual) return null;

  const xSpan = Math.max(surface.bounds.x_max - surface.bounds.x_min, 1);
  const ySpan = Math.max(surface.bounds.y_max - surface.bounds.y_min, 1);
  const zSpan = Math.max((surface.bounds.z_max ?? 1) - (surface.bounds.z_min ?? -1), 1);
  const hx = xSpan / 220;
  const hy = ySpan / 220;
  const hz = zSpan / 220;

  const magnitudes = surface.data.vertices.map(([x, y, z]) => {
    try {
      const gx = (residual([x + hx, y, z]) - residual([x - hx, y, z])) / (2 * hx);
      const gy = (residual([x, y + hy, z]) - residual([x, y - hy, z])) / (2 * hy);
      const gz = (residual([x, y, z + hz]) - residual([x, y, z - hz])) / (2 * hz);
      return Math.sqrt(gx * gx + gy * gy + gz * gz);
    } catch {
      return Number.NaN;
    }
  });

  return buildValueColors(magnitudes);
}

function buildCurvatureColors(surface?: Surface) {
  if (!surface?.data) return null;

  const normals = computeVertexNormalsFromMesh(surface);
  if (!normals) return null;

  const neighbors = surface.data.vertices.map(() => new Set<number>());
  for (let i = 0; i < surface.data.indices.length; i += 3) {
    const triangle = [surface.data.indices[i], surface.data.indices[i + 1], surface.data.indices[i + 2]];
    for (let a = 0; a < 3; a += 1) {
      for (let b = 0; b < 3; b += 1) {
        if (a !== b) neighbors[triangle[a]].add(triangle[b]);
      }
    }
  }

  const curvatureValues = surface.data.vertices.map((vertex, index) => {
    const adjacent = Array.from(neighbors[index]);
    if (!adjacent.length) return 0;

    let sum = 0;
    let count = 0;
    for (const neighborIndex of adjacent) {
      const neighbor = surface.data!.vertices[neighborIndex];
      const normalA = normals[index];
      const normalB = normals[neighborIndex];
      const dot = Math.min(1, Math.max(-1, normalA[0] * normalB[0] + normalA[1] * normalB[1] + normalA[2] * normalB[2]));
      const angle = Math.acos(dot);
      const distance = Math.hypot(
        neighbor[0] - vertex[0],
        neighbor[1] - vertex[1],
        neighbor[2] - vertex[2]
      );
      if (distance > 1e-6) {
        sum += angle / distance;
        count += 1;
      }
    }
    return count > 0 ? sum / count : 0;
  });

  return buildValueColors(curvatureValues);
}

function classifySectionCurve(surface?: Surface, plane?: PlaneCoefficients) {
  if (!surface || !plane) return 'неизвестная кривая';

  const eq = surface.equation.toLowerCase();
  const verticalPlane = Math.abs(plane.c) < 1e-8;

  if (eq.includes('x^2 + y^2 = 4') || eq.includes('x² + y² = 4')) {
    return verticalPlane ? 'две образующие цилиндра или параллельные прямые' : 'эллипс или окружность';
  }
  if (eq.includes('x^2 + y^2 = z^2') || eq.includes('x² + y² = z²')) {
    return verticalPlane ? 'две прямые на конусе' : 'коника (эллипс, парабола или гипербола)';
  }
  if (eq.includes('x^2 + y^2 + z^2')) {
    return 'окружность';
  }
  if (eq.includes('x^2 - y^2') || eq.includes('x² - y²')) {
    return 'пространственная линия сечения седловой поверхности';
  }
  if (eq.includes('x^2 + y^2') || eq.includes('x² + y²')) {
    return 'плоская кривая сечения';
  }

  return 'пространственная линия пересечения';
}

function buildSectionFromSurface(surface: Surface | undefined, planeEquation: string): SectionData | null {
  if (!surface?.data) return null;

  const plane = parsePlaneEquation(planeEquation);
  if (!plane) return null;

  const { vertices, indices } = surface.data;
  const segments: number[][][] = [];
  const rawPoints: number[][] = [];

  for (let i = 0; i < indices.length; i += 3) {
    const p0 = vertices[indices[i]];
    const p1 = vertices[indices[i + 1]];
    const p2 = vertices[indices[i + 2]];
    if (!p0 || !p1 || !p2) continue;

    const values = [evaluatePlane(plane, p0), evaluatePlane(plane, p1), evaluatePlane(plane, p2)];
    const triangle = [p0, p1, p2];
    const uniqueHits = collectIsoPointsFromTriangle(triangle, values);
    if (uniqueHits.length >= 2) {
      segments.push([uniqueHits[0], uniqueHits[1]]);
      rawPoints.push(uniqueHits[0], uniqueHits[1]);
    }
  }

  const points = deduplicatePoints(rawPoints);

  return {
    planeEquation,
    plane,
    curveType: points.length > 0 ? 'spatial' : 'unknown',
    curveTypeRu: classifySectionCurve(surface, plane),
    points,
    segments
  };
}

// Компонент FPS монитора
function FPSMonitor({ onFPSUpdate }: { onFPSUpdate: (fps: number) => void }) {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  useThree(() => {
    const now = performance.now();
    frameCount.current++;
    if (now - lastTime.current >= 1000) {
      onFPSUpdate(frameCount.current);
      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  return null;
}

// Парсинг параметрического уравнения
function parseParametricEquation(eq: string): { x: string; y: string; z: string } | null {
  const normalized = eq
    .replace(/;/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const values: Partial<{ x: string; y: string; z: string }> = {};

  for (const line of normalized) {
    const match = line.match(/^([xyz])\s*=\s*(.+)$/i);
    if (!match) continue;

    const axis = match[1].toLowerCase() as 'x' | 'y' | 'z';
    values[axis] = match[2].trim().replace(/,\s*$/, '');
  }

  if (values.x && values.y && values.z) {
    return {
      x: values.x,
      y: values.y,
      z: values.z
    };
  }

  const inlineMatch = eq.match(/x\s*=\s*([^,\n;]+)[,\n;]+y\s*=\s*([^,\n;]+)[,\n;]+z\s*=\s*([^,\n;]+)/i);
  if (inlineMatch) {
    return {
      x: inlineMatch[1].trim(),
      y: inlineMatch[2].trim(),
      z: inlineMatch[3].trim()
    };
  }

  return null;
}

function App() {
  // Состояния
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ x: number; y: number; z: number; surfaceId: string } | null>(null);
  const [fps, setFps] = useState(0);
  const [equation, setEquation] = useState('x^2 - y^2');
  const [resolution, setResolution] = useState(80);
  const [darkMode, setDarkMode] = useState(false);

  // Инструменты анализа
  const [showSection, setShowSection] = useState(false);
  const [sectionEquation, setSectionEquation] = useState('z = 0');
  const [sectionCurve, setSectionCurve] = useState<SectionData | null>(null);
  const [showLevelLines, setShowLevelLines] = useState(false);
  const [levelValue, setLevelValue] = useState(0);
  const [levelLines, setLevelLines] = useState<LevelLineEntry[]>([]);
  const [colorAnalysisMode, setColorAnalysisMode] = useState<ColorAnalysisMode>('off');
  const [showRuledGenerators, setShowRuledGenerators] = useState(false);
  const [showSpecialPoints, setShowSpecialPoints] = useState(true);
  const [showNormal, setShowNormal] = useState(false);
  const [normalPoint, setNormalPoint] = useState<{ x: number; y: number; z: number } | null>(null);
  const [showTangentPlane, setShowTangentPlane] = useState(false);
  const [tangentPoint, setTangentPoint] = useState<{ x: number; y: number; z: number } | null>(null);
  const [showCurvature, setShowCurvature] = useState(false);
  const [curvatureData, setCurvatureData] = useState<CurvatureData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [showResults, setShowResults] = useState(true);
  const [showLearningPanel, setShowLearningPanel] = useState(true);
  const [showIntersections, setShowIntersections] = useState(true);
  const [intersectionPoints, setIntersectionPoints] = useState<IntersectionPoint[]>([]);
  const [intersectionSegments, setIntersectionSegments] = useState<number[][][]>([]);
  const [equationAnalysis, setEquationAnalysis] = useState<EquationAnalysisResponse | null>(null);
  const [systemAnalysis, setSystemAnalysis] = useState<SystemAnalysisResponse | null>(null);
  const [showCriticalPoints, setShowCriticalPoints] = useState(true);
  const [activeTab, setActiveTab] = useState<'point' | 'curvature' | 'section' | 'solver' | 'systems' | 'theory'>('point');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Автоматическое определение типа уравнения
  const detectEquationType = useCallback((eq: string): { type: SurfaceType; displayName: string; icon: string } => {
    const equationStr = eq.trim().toLowerCase();
    const hasParametricAxes =
      /(^|\n|\r)\s*x\s*=/.test(equationStr) &&
      /(^|\n|\r)\s*y\s*=/.test(equationStr) &&
      /(^|\n|\r)\s*z\s*=/.test(equationStr);
    
    // Параметрическая
    if (hasParametricAxes || parseParametricEquation(eq) !== null) {
      return { type: 'parametric', displayName: 'Параметрическая поверхность', icon: '🎯' };
    }
    
    // Неявная (содержит знак = и НЕ начинается с z=)
    if (equationStr.includes('=') && !equationStr.startsWith('z=') && !equationStr.startsWith('z =')) {
      return { type: 'implicit', displayName: 'Неявная функция F(x,y,z)=0', icon: '🔮' };
    }
    
    // Явная (всё остальное)
    return { type: 'explicit', displayName: 'Явная функция z = f(x,y)', icon: '📈' };
  }, []);

  // Построение параметров запроса
  const buildRequestFromEquation = useCallback(() => {
    const detectedType = detectEquationType(equation);
    const cleanEq = equation.trim();
    
    if (detectedType.type === 'parametric') {
      const params = parseParametricEquation(equation);
      return {
        equation: '',
        surface_type: 'parametric',
        x_min: -3, x_max: 3, y_min: -3, y_max: 3, z_min: -3, z_max: 3,
        resolution: resolution,
        param_u_min: 0, param_u_max: 2 * Math.PI,
        param_v_min: 0, param_v_max: 2 * Math.PI,
        param_x_expr: params?.x || 'sin(u)*cos(v)',
        param_y_expr: params?.y || 'sin(u)*sin(v)',
        param_z_expr: params?.z || 'cos(u)'
      };
    } else if (detectedType.type === 'implicit') {
      let implicitEq = cleanEq;
      if (implicitEq.includes('=')) {
        const parts = implicitEq.split('=');
        const left = parts[0].trim();
        const right = parts[1].trim();
        const rightNum = parseFloat(right);
        if (!isNaN(rightNum)) {
          implicitEq = `${left} - ${rightNum}`;
        } else {
          implicitEq = `${left} - (${right})`;
        }
      }
      // Определяем границы для разных типов
      let bounds = { x_min: -3, x_max: 3, y_min: -3, y_max: 3, z_min: -3, z_max: 3 };
      if (cleanEq.includes('x^2 + y^2 = z^2')) {
        bounds = { x_min: -4, x_max: 4, y_min: -4, y_max: 4, z_min: -4, z_max: 4 };
      } else if (cleanEq.includes('x^2 + y^2 = 4')) {
        bounds = { x_min: -3, x_max: 3, y_min: -3, y_max: 3, z_min: -3, z_max: 3 };
      } else if (cleanEq.includes('x^2 + y^2 + z^2')) {
        bounds = { x_min: -3.5, x_max: 3.5, y_min: -3.5, y_max: 3.5, z_min: -3.5, z_max: 3.5 };
      }
      return {
        equation: implicitEq,
        surface_type: 'implicit',
        x_min: bounds.x_min, x_max: bounds.x_max,
        y_min: bounds.y_min, y_max: bounds.y_max,
        z_min: bounds.z_min, z_max: bounds.z_max,
        resolution: resolution
      };
    } else {
      let explicitEq = cleanEq.replace(/^z\s*=\s*/, '');
      return {
        equation: explicitEq,
        surface_type: 'explicit',
        x_min: -3, x_max: 3, y_min: -3, y_max: 3,
        resolution: resolution
      };
    }
  }, [equation, resolution, detectEquationType]);

  const getRandomColor = (): string => {
    const colors = ['#2B7BE4', '#4A9EFF', '#E53935', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#C084FC', '#F97316'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Поиск точек пересечения между поверхностями
  const findIntersections = useCallback(() => {
    const visibleSurfaces = surfaces.filter((surface) => surface.visible && surface.data);

    if (visibleSurfaces.length < 2) {
      setIntersectionPoints([]);
      setIntersectionSegments([]);
      return;
    }

    const actualPoints: IntersectionPoint[] = [];
    const actualSegments: number[][][] = [];

    for (let i = 0; i < visibleSurfaces.length; i += 1) {
      for (let j = i + 1; j < visibleSurfaces.length; j += 1) {
        const surfaceA = visibleSurfaces[i];
        const surfaceB = visibleSurfaces[j];
        const { points, segments } = buildIntersectionGeometryBetweenSurfaces(surfaceA, surfaceB);

        for (const point of points) {
          actualPoints.push({
            point: { x: point[0], y: point[1], z: point[2] },
            surfaceIds: [surfaceA.id, surfaceB.id],
            type: 'intersection'
          });
        }

        actualSegments.push(...segments);
      }
    }

    setIntersectionPoints(actualPoints);
    setIntersectionSegments(actualSegments);
  }, [surfaces]);

  // Построение поверхности
  const handleBuildSurface = useCallback(async () => {
    if (!equation.trim()) {
      setError('Введите уравнение поверхности');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const params = buildRequestFromEquation();
      const data = await buildSurface(params as any);
      
      const detected = detectEquationType(equation);
      
      const newSurface: Surface = {
        id: Date.now().toString(),
        equation: equation,
        detectedType: detected.type,
        request: params as any,
        color: getRandomColor(),
        visible: true,
        opacity: 0.9,
        resolution: resolution,
        bounds: {
          x_min: params.x_min,
          x_max: params.x_max,
          y_min: params.y_min,
          y_max: params.y_max,
          z_min: params.z_min,
          z_max: params.z_max
        },
        data: data,
        stats: {
          vertices: data.vertices.length,
          triangles: data.indices.length / 3,
          time: data.computation_time
        }
      };
      
      setSurfaces(prev => [...prev, newSurface]);
      setSelectedSurfaceId(newSurface.id);
      setAnalysisResult(`✅ Поверхность "${equation}" построена за ${data.computation_time.toFixed(2)}с`);
      setTimeout(() => setAnalysisResult(''), 3000);
    } catch (err: any) {
      console.error('Ошибка:', err);
      setError(err.message);
      setAnalysisResult(`❌ Ошибка: ${err.message}`);
      setTimeout(() => setAnalysisResult(''), 3000);
    } finally {
      setIsLoading(false);
    }
  }, [equation, resolution, buildRequestFromEquation, detectEquationType]);

  const handleAddAnotherSurface = () => {
    setEquation('');
    setTimeout(() => {
      document.querySelector('.equation-field')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleRemoveSurface = (id: string) => {
    setSurfaces(prev => prev.filter(s => s.id !== id));
    if (selectedSurfaceId === id) {
      setSelectedSurfaceId(surfaces.length > 1 ? surfaces[0].id : null);
    }
  };

  const handleToggleVisibility = (id: string) => {
    setSurfaces(prev => prev.map(s => 
      s.id === id ? { ...s, visible: !s.visible } : s
    ));
  };

  const handleChangeColor = (id: string, color: string) => {
    setSurfaces(prev => prev.map(s => 
      s.id === id ? { ...s, color: color } : s
    ));
  };

  const handleChangeOpacity = (id: string, opacity: number) => {
    setSurfaces(prev => prev.map(s => 
      s.id === id ? { ...s, opacity: opacity } : s
    ));
  };

  const handlePointSelect = async (point: { x: number; y: number; z: number }, surfaceId: string) => {
    setSelectedPoint({ ...point, surfaceId });
    setNormalPoint(point);
    setTangentPoint(point);

    const selectedSurface = surfaces.find((surface) => surface.id === surfaceId);
    if (selectedSurface?.request) {
      try {
        const request = selectedSurface.request;

        if (selectedSurface.detectedType === 'explicit') {
          const response = await computeCurvature({
            equation: request.equation,
            surface_type: 'explicit',
            x: point.x,
            y: point.y,
            z: point.z,
          });

          setCurvatureData({
            E: response.E,
            F: response.F,
            G: response.G,
            L: response.L,
            M: response.M,
            N: response.N,
            gaussian: response.gaussian,
            mean: response.mean,
            principal1: response.principal1,
            principal2: response.principal2,
            pointType: response.point_type,
            pointTypeRu: response.point_type_ru
          });
        } else if (
          selectedSurface.detectedType === 'parametric' &&
          request.param_x_expr &&
          request.param_y_expr &&
          request.param_z_expr &&
          selectedSurface.data
        ) {
          const nearestIndex = getNearestVertexIndex(selectedSurface.data.vertices, point);
          const resolutionValue = Math.max(selectedSurface.resolution, 2);
          const row = Math.floor(nearestIndex / resolutionValue);
          const col = nearestIndex % resolutionValue;
          const uMin = request.param_u_min ?? 0;
          const uMax = request.param_u_max ?? Math.PI;
          const vMin = request.param_v_min ?? 0;
          const vMax = request.param_v_max ?? 2 * Math.PI;
          const u = uMin + ((uMax - uMin) * col) / (resolutionValue - 1);
          const v = vMin + ((vMax - vMin) * row) / (resolutionValue - 1);

          const response = await computeCurvature({
            equation: '',
            surface_type: 'parametric',
            u,
            v,
            x: point.x,
            y: point.y,
            z: point.z,
            param_x_expr: request.param_x_expr,
            param_y_expr: request.param_y_expr,
            param_z_expr: request.param_z_expr,
          });

          setCurvatureData({
            E: response.E,
            F: response.F,
            G: response.G,
            L: response.L,
            M: response.M,
            N: response.N,
            gaussian: response.gaussian,
            mean: response.mean,
            principal1: response.principal1,
            principal2: response.principal2,
            pointType: response.point_type,
            pointTypeRu: response.point_type_ru
          });
        } else {
          setCurvatureData(null);
        }
      } catch (error: any) {
        console.error('Ошибка вычисления кривизны:', error);
        setCurvatureData(null);
        setAnalysisResult(`⚠️ Кривизна недоступна: ${error.message}`);
      }
    }

    setAnalysisResult(`📍 Точка: (${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)})`);
  };

  const handleBuildSection = () => {
    if (!selectedSurfaceId) {
      setAnalysisResult('❌ Выберите поверхность для построения сечения');
      return;
    }

    const selectedSurface = surfaces.find((s) => s.id === selectedSurfaceId);
    const section = buildSectionFromSurface(selectedSurface, sectionEquation);

    if (!section) {
      setAnalysisResult('❌ Введите плоскость в виде ax + by + cz + d = 0, например x + y + z - 2 = 0');
      return;
    }

    setSectionCurve(section);
    setShowSection(true);
    setShowResults(true);
    setActiveTab('section');

    if (section.points.length === 0) {
      setAnalysisResult('✂️ Плоскость задана, но в текущей области она не пересекает выбранную поверхность');
      return;
    }

    setAnalysisResult(
      `✂️ Сечение ${section.planeEquation}: ${section.points.length} характерных точек, тип — «${section.curveTypeRu}»`
    );
  };

  const handlePresetSection = (axis: 'x' | 'y') => {
    const value = axis === 'x' ? 0 : 0;
    const equationValue = `${axis} = ${value}`;
    setSectionEquation(equationValue);
    setTimeout(() => {
      const selectedSurface = surfaces.find((s) => s.id === selectedSurfaceId);
      const section = buildSectionFromSurface(selectedSurface, equationValue);
      if (!section) {
        setAnalysisResult(`❌ Не удалось построить сечение ${equationValue}`);
        return;
      }
      setSectionCurve(section);
      setShowSection(true);
      setShowResults(true);
      setActiveTab('section');
      setAnalysisResult(`✂️ Построено сечение ${equationValue}`);
    }, 0);
  };

  const handleBuildLevelLine = () => {
    if (!selectedSurfaceId) {
      setAnalysisResult('❌ Выберите поверхность для построения линии уровня');
      return;
    }

    const selectedSurface = surfaces.find((s) => s.id === selectedSurfaceId);
    if (!selectedSurface) {
      setAnalysisResult('❌ Поверхность не найдена');
      return;
    }

    const section = buildSectionFromSurface(selectedSurface, `z - ${levelValue} = 0`);
    if (!section) {
      setAnalysisResult('❌ Не удалось построить линию уровня');
      return;
    }

    const curve = {
      ...section,
      planeEquation: `z = ${levelValue}`
    };
    const levelId = `${selectedSurface.id}-${levelValue.toFixed(3)}`;

    setLevelLines((prev) => {
      const nextEntry: LevelLineEntry = {
        id: levelId,
        surfaceId: selectedSurface.id,
        value: levelValue,
        curve,
      };
      const withoutDuplicate = prev.filter((entry) => !(entry.surfaceId === selectedSurface.id && Math.abs(entry.value - levelValue) < 1e-6));
      return [...withoutDuplicate, nextEntry];
    });
    setShowLevelLines(true);
    setActiveTab('section');
    setShowResults(true);
    setAnalysisResult(`📏 Добавлена линия уровня z = ${levelValue}`);
  };

  const handleRemoveLevelLine = useCallback((id: string) => {
    setLevelLines((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const handleClearLevelLines = useCallback(() => {
    setLevelLines([]);
    setShowLevelLines(false);
  }, []);

  const handleAnalyzeEquation = async () => {
    const selectedSurface = surfaces.find((s) => s.id === selectedSurfaceId);
    if (!selectedSurface?.request) {
      setAnalysisResult('❌ Выберите поверхность для символьного анализа');
      return;
    }

    try {
      const response = await analyzeEquation({
        equation: selectedSurface.request.equation || selectedSurface.equation,
        surface_type: selectedSurface.detectedType,
        param_x_expr: selectedSurface.request.param_x_expr,
        param_y_expr: selectedSurface.request.param_y_expr,
        param_z_expr: selectedSurface.request.param_z_expr,
      });
      setEquationAnalysis(response);
      setShowCriticalPoints(true);
      setActiveTab('solver');
      setAnalysisResult(`🧠 Решатель: найдено критических точек ${response.critical_points.length}`);
    } catch (error: any) {
      setEquationAnalysis(null);
      setAnalysisResult(`❌ Ошибка решателя: ${error.message}`);
    }
  };

  useEffect(() => {
    setEquationAnalysis(null);
    setShowCriticalPoints(false);
  }, [selectedSurfaceId]);

  useEffect(() => {
    const visibleSurfaces = surfaces.filter((surface) => surface.visible).slice(0, 2);
    if (visibleSurfaces.length < 2) {
      setSystemAnalysis(null);
      return;
    }

    let cancelled = false;

    const runSystemAnalysis = async () => {
      try {
        const response = await analyzeSystem({
          surface_a: {
            equation: visibleSurfaces[0].request?.equation || visibleSurfaces[0].equation,
            surface_type: visibleSurfaces[0].detectedType,
            param_x_expr: visibleSurfaces[0].request?.param_x_expr,
            param_y_expr: visibleSurfaces[0].request?.param_y_expr,
            param_z_expr: visibleSurfaces[0].request?.param_z_expr,
          },
          surface_b: {
            equation: visibleSurfaces[1].request?.equation || visibleSurfaces[1].equation,
            surface_type: visibleSurfaces[1].detectedType,
            param_x_expr: visibleSurfaces[1].request?.param_x_expr,
            param_y_expr: visibleSurfaces[1].request?.param_y_expr,
            param_z_expr: visibleSurfaces[1].request?.param_z_expr,
          }
        });
        if (!cancelled) {
          setSystemAnalysis(response);
        }
      } catch {
        if (!cancelled) {
          setSystemAnalysis(null);
        }
      }
    };

    runSystemAnalysis();
    return () => {
      cancelled = true;
    };
  }, [surfaces]);

  const handleExportImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setAnalysisResult('❌ Холст сцены пока недоступен для экспорта');
      return;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `surface-visualizer-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setAnalysisResult('🖼️ Скриншот сцены сохранён в PNG');
  };

  const handleExportData = () => {
    const selectedSurface = surfaces.find((s) => s.id === selectedSurfaceId);

    let rows: number[][] = [];
    let source = 'surface-points';

    const activeLevelLine = levelLines[levelLines.length - 1];

    if (showLevelLines && activeLevelLine?.curve.points.length) {
      rows = activeLevelLine.curve.points;
      source = 'level-line';
    } else if (showSection && sectionCurve?.points.length) {
      rows = sectionCurve.points;
      source = 'section';
    } else if (showIntersections && intersectionPoints.length) {
      rows = intersectionPoints.map((point) => [point.point.x, point.point.y, point.point.z]);
      source = 'intersections';
    } else if (selectedSurface?.data?.vertices.length) {
      rows = selectedSurface.data.vertices;
      source = 'surface-mesh';
    }

    if (rows.length === 0) {
      setAnalysisResult('❌ Нет данных для экспорта в CSV');
      return;
    }

    const csv = [
      'x,y,z',
      ...rows.map((row) => row.map((value) => Number.isFinite(value) ? value.toFixed(6) : '').join(','))
    ].join('\n');

    downloadTextFile(
      `surface-visualizer-${source}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
    setAnalysisResult(`📄 CSV экспортирован: ${rows.length} точек`);
  };

  const handleShowNormal = () => {
    if (!normalPoint) {
      setAnalysisResult('❌ Выберите точку на поверхности (кликните по поверхности)');
      return;
    }
    setShowNormal(!showNormal);
    setAnalysisResult(showNormal 
      ? '⬆️ Вектор нормали скрыт' 
      : `⬆️ Вектор нормали в точке (${normalPoint.x.toFixed(3)}, ${normalPoint.y.toFixed(3)}, ${normalPoint.z.toFixed(3)})`);
  };

  const handleShowTangentPlane = () => {
    if (!tangentPoint) {
      setAnalysisResult('❌ Выберите точку на поверхности (кликните по поверхности)');
      return;
    }
    setShowTangentPlane(!showTangentPlane);
    setAnalysisResult(showTangentPlane 
      ? '📐 Касательная плоскость скрыта' 
      : `📐 Касательная плоскость в точке (${tangentPoint.x.toFixed(3)}, ${tangentPoint.y.toFixed(3)}, ${tangentPoint.z.toFixed(3)})`);
  };

  const handleShowCurvature = () => {
    if (!selectedPoint) {
      setAnalysisResult('❌ Выберите точку на поверхности для анализа кривизны');
      return;
    }
    setShowCurvature(!showCurvature);
    if (curvatureData) {
      setAnalysisResult(`📊 Гауссова кривизна: ${curvatureData.gaussian.toFixed(4)}, ${curvatureData.pointTypeRu}`);
    }
  };

  // Теоретический материал
  const theoryContent = {
    explicit: {
      title: 'Явное задание поверхности',
      content: 'Поверхность задаётся уравнением z = f(x, y). Касательная плоскость: z - z₀ = f_x(x₀,y₀)(x-x₀) + f_y(x₀,y₀)(y-y₀). Нормаль: n = (-f_x, -f_y, 1).'
    },
    implicit: {
      title: 'Неявное задание поверхности',
      content: 'Поверхность задаётся уравнением F(x, y, z) = 0. Градиент ∇F = (F_x, F_y, F_z) направлен по нормали. Касательная плоскость: F_x(x-x₀) + F_y(y-y₀) + F_z(z-z₀) = 0.'
    },
    parametric: {
      title: 'Параметрическое задание поверхности',
      content: 'Поверхность задаётся векторной функцией r(u,v) = (x(u,v), y(u,v), z(u,v)). Это наиболее гибкий способ описания сложных поверхностей.'
    },
    curvature: {
      title: 'Кривизна поверхности',
      content: 'Первая квадратичная форма: I = E du² + 2F du dv + G dv². Вторая квадратичная форма: II = L du² + 2M du dv + N dv². Гауссова кривизна: K = (LN - M²)/(EG - F²).'
    },
    section: {
      title: 'Метод сечений',
      content: 'Метод исследования формы поверхности путём пересечения её плоскостями. Сечения позволяют определить тип поверхности и её свойства.'
    }
  };

  const examples = [
    { name: 'Параболоид', eq: 'x^2 + y^2', desc: 'Эллиптический параболоид, K > 0' },
    { name: 'Седло', eq: 'x^2 - y^2', desc: 'Гиперболический параболоид, K < 0' },
    { name: 'Сфера', eq: 'x^2 + y^2 + z^2 = 9', desc: 'Сфера радиуса 3, K > 0' },
    { name: 'Конус', eq: 'x^2 + y^2 = z^2', desc: 'Конус, особая точка' },
    { name: 'Цилиндр', eq: 'x^2 + y^2 = 4', desc: 'Цилиндр, K = 0' },
    { name: 'Волна', eq: 'sin(x) * cos(y)', desc: 'Периодическая поверхность' },
    { name: 'Гауссиан', eq: 'exp(-(x^2 + y^2))', desc: 'Колоколообразная поверхность' },
  ];

  const loadExample = (eq: string) => {
    setEquation(eq);
  };

  const totalVertices = surfaces.reduce((sum, s) => sum + (s.stats?.vertices || 0), 0);
  const detected = detectEquationType(equation);

  useEffect(() => {
    findIntersections();
  }, [surfaces, findIntersections]);

  useEffect(() => {
    if (!levelLines.length) return;

    setLevelLines((prev) => prev.map((entry) => {
      const surface = surfaces.find((item) => item.id === entry.surfaceId);
      if (!surface) return null;

      const section = buildSectionFromSurface(surface, `z - ${entry.value} = 0`);
      if (!section) return null;

      return {
        ...entry,
        curve: {
          ...section,
          planeEquation: `z = ${entry.value}`
        }
      };
    }).filter(Boolean) as LevelLineEntry[]);
  }, [surfaces]);

  const selectedSurface = surfaces.find(s => s.id === selectedSurfaceId);
  const activeLevelLine = levelLines[levelLines.length - 1] ?? null;
  const displayedSectionCurve = showLevelLines && activeLevelLine ? activeLevelLine.curve : sectionCurve;
  const displayedSectionEquation = showLevelLines && activeLevelLine
    ? activeLevelLine.curve.planeEquation
    : sectionEquation;
  const current2DAnalysis = useMemo(() => {
    if (showLevelLines && activeLevelLine) return computeSectionDisplayAnalysis(activeLevelLine.curve);
    if (showSection && sectionCurve) return computeSectionDisplayAnalysis(sectionCurve);
    return null;
  }, [showLevelLines, activeLevelLine, showSection, sectionCurve]);
  const dynamicSectionSummary = useMemo(() => {
    if (!current2DAnalysis) return null;
    const planeLabel = showLevelLines && activeLevelLine ? activeLevelLine.curve.planeEquation : sectionCurve?.planeEquation || sectionEquation;
    return analyzeSectionSummary(selectedSurface, planeLabel, current2DAnalysis);
  }, [current2DAnalysis, showLevelLines, activeLevelLine, sectionCurve, sectionEquation, selectedSurface]);
  const sectionAxisViews = useMemo(() => {
    if (!displayedSectionCurve) return [];
    return buildAxisProjectionViews(displayedSectionCurve.points, displayedSectionCurve.segments);
  }, [displayedSectionCurve]);
  const intersectionSummary = useMemo(
    () => summarizeSurfaceIntersection(surfaces.filter((s) => s.visible), intersectionPoints),
    [surfaces, intersectionPoints]
  );
  const resolvedSystemSummary = useMemo(() => {
    if (!systemAnalysis) return intersectionSummary;
    return {
      title: systemAnalysis.title,
      formula: systemAnalysis.formula,
      detail: `${systemAnalysis.detail} Тип кривой: ${systemAnalysis.curve_type}.`,
      radius: systemAnalysis.radius ?? null,
    };
  }, [systemAnalysis, intersectionSummary]);
  const systemExplanation = useMemo(
    () => explainSystemIntersection(surfaces.filter((s) => s.visible), systemAnalysis, resolvedSystemSummary),
    [surfaces, systemAnalysis, resolvedSystemSummary]
  );
  const visibleSurfaces = useMemo(
    () => surfaces.filter((surface) => surface.visible),
    [surfaces]
  );
  const xyContour = useMemo(() => {
    if (visibleSurfaces.length !== 2) return null;
    const [surfaceA, surfaceB] = visibleSurfaces;
    return buildXYIntersectionContour(surfaceA, surfaceB, 170);
  }, [visibleSurfaces]);
  const intersection2DComponents = useMemo(() => {
    if (xyContour) {
      return [{
        label: 'Пересечение',
        planeLabel: 'Плоскость Oxy',
        analysis: xyContour.analysis,
        displayShape: 'polyline' as const,
        axisViews: buildAxisProjectionViews(xyContour.segments3D.flat(), xyContour.segments3D),
      }];
    }

    const idealComponents = buildIdealIntersection2DComponents(systemAnalysis, resolvedSystemSummary);
    if (idealComponents) {
      return idealComponents.map((component) => ({
        ...component,
        axisViews: [] as AxisProjectionView[],
      }));
    }

    const rawPoints = intersectionPoints.map((item) => [item.point.x, item.point.y, item.point.z]);
    const curveTypeLabel = systemAnalysis?.curve_type ?? resolvedSystemSummary.detail;
    const mergedSegments = intersectionSegments.length
      ? intersectionSegments
      : buildIntersectionLineSegments(rawPoints, curveTypeLabel);

    const mergedPoints = deduplicatePoints(
      mergedSegments.length ? mergedSegments.flat() : rawPoints,
      1e-4
    );

    const zBandSegments = mergedSegments.length ? splitSegmentsByZBands(mergedSegments) : [];

    if (zBandSegments.length === 2) {
      const displayed = zBandSegments
        .map((componentSegments, componentIndex) => {
          const component = buildIntersectionComponentDisplay(
            componentSegments,
            componentIndex === 0 ? 'Нижняя компонента' : 'Верхняя компонента'
          );
          if (!component) return null;
          return {
            ...component,
            axisViews: buildAxisProjectionViews(componentSegments.flat(), componentSegments),
          };
        })
        .filter(Boolean) as Array<{
          label: string;
          planeLabel: string;
          analysis: Plot2DAnalysis;
          displayShape: 'circle' | 'polyline';
          axisViews: AxisProjectionView[];
        }>;

      if (displayed.length === 2) {
        return displayed;
      }
    }

    const connectedComponents = mergedSegments.length
      ? splitSegmentComponents(mergedSegments)
        .map((component) => ({
          segments: component,
          size: deduplicatePoints(component.flat(), 1e-4).length,
        }))
        .sort((a, b) => b.size - a.size)
      : [];

    const largestComponentSize = connectedComponents[0]?.size ?? 0;
    const majorComponents = connectedComponents.filter((component) => {
      const largest = largestComponentSize;
      return component.size >= 10 && component.size >= largest * 0.28;
    });

    if (majorComponents.length === 2) {
      const displayed = majorComponents
        .map((component, componentIndex) => buildIntersectionComponentDisplay(
          component.segments,
          componentIndex === 0 ? 'Компонента 1' : 'Компонента 2'
        ))
        .filter(Boolean)
        .map((component, componentIndex) => ({
          ...component!,
          axisViews: buildAxisProjectionViews(majorComponents[componentIndex].segments.flat(), majorComponents[componentIndex].segments),
        })) as Array<{
          label: string;
          planeLabel: string;
          analysis: Plot2DAnalysis;
          displayShape: 'circle' | 'polyline';
          axisViews: AxisProjectionView[];
        }>;

      if (displayed.length === 2) {
        return displayed;
      }
    }

    const avgZ = mergedPoints.reduce((sum, point) => sum + point[2], 0) / Math.max(mergedPoints.length, 1);
    const zSpread = mergedPoints.length
      ? Math.max(...mergedPoints.map((point) => point[2])) - Math.min(...mergedPoints.map((point) => point[2]))
      : 0;
    const plane = zSpread < 0.2 ? { a: 0, b: 0, c: 1, d: -avgZ } : null;
    const analysis = mergedSegments.length
      ? buildSegmentPolylines2D(mergedSegments, plane)
      : compute2DPointCloudAnalysis(mergedPoints, plane);
    if (!analysis) return [];

    return [{
      label: 'Пересечение',
      planeLabel: plane ? `z = ${avgZ.toFixed(3)}` : 'Собственная плоскость проекции',
      analysis,
      displayShape: 'polyline' as const,
      axisViews: buildAxisProjectionViews(mergedPoints, mergedSegments),
    }];
  }, [xyContour, intersectionPoints, intersectionSegments, systemAnalysis, resolvedSystemSummary]);
  const intersectionLinePositions = useMemo(() => {
    if (!showIntersections) return null;
    if (xyContour?.segments3D.length) {
      return buildLineGeometry(xyContour.segments3D, 2200);
    }
    if (intersectionSegments.length > 0) {
      return buildLineGeometry(intersectionSegments, 1600);
    }
    if (intersectionPoints.length < 2) return null;
    const curveType = systemAnalysis?.curve_type ?? resolvedSystemSummary.detail;
    const segments = buildIntersectionLineSegments(
      intersectionPoints.map((item) => [item.point.x, item.point.y, item.point.z]),
      curveType
    );
    return buildLineGeometry(segments, 520);
  }, [showIntersections, xyContour, intersectionSegments, intersectionPoints, systemAnalysis, resolvedSystemSummary]);
  const intersectionHighlightPositions = useMemo(() => {
    if (!showIntersections) return null;
    const points = xyContour?.segments3D?.flat()
      ?? (intersectionSegments.length ? intersectionSegments.flat() : intersectionPoints.map((item) => [item.point.x, item.point.y, item.point.z]));
    return buildPointGeometry(points, 520);
  }, [showIntersections, xyContour, intersectionSegments, intersectionPoints]);
  const levelLinePositions = useMemo(
    () => {
      if (!showLevelLines) return null;
      const segments = levelLines.flatMap((entry) => {
        const surface = surfaces.find((item) => item.id === entry.surfaceId);
        const analysis = compute2DSectionAnalysis(entry.curve);
        const summary = analysis ? analyzeSectionSummary(surface, entry.curve.planeEquation, analysis) : null;
        const circleHint = summary?.type.toLowerCase().includes('окруж') ?? false;

        return buildSmoothCurveSegments(entry.curve.points, entry.curve.plane, {
          closedHint: circleHint || entry.curve.curveType === 'circle',
          circleHint,
          sampleCount: 108,
        });
      });
      return buildLineGeometry(segments, 720);
    },
    [showLevelLines, levelLines, surfaces]
  );
  const classificationData = useMemo(() => classifySurface(selectedSurface), [selectedSurface]);
  const generatorLinePositions = useMemo(
    () => (showRuledGenerators ? buildLineGeometry(classificationData.ruledSegments, 100) : null),
    [showRuledGenerators, classificationData]
  );
  const specialPointPositions = useMemo(
    () => (showSpecialPoints ? buildPointGeometry(classificationData.specialPoints, 40) : null),
    [showSpecialPoints, classificationData]
  );
  const criticalPointPositions = useMemo(
    () => (showCriticalPoints ? buildPointGeometry(equationAnalysis?.critical_points.map((p) => [p.x, p.y, p.z]), 24) : null),
    [showCriticalPoints, equationAnalysis]
  );
  const gradientColors = useMemo(() => {
    if (!selectedSurface || colorAnalysisMode === 'off') return null;
    if (colorAnalysisMode === 'explicit-gradient') return buildExplicitGradientColors(selectedSurface);
    if (colorAnalysisMode === 'implicit-gradient') return buildImplicitGradientColors(selectedSurface);
    if (colorAnalysisMode === 'curvature') return buildCurvatureColors(selectedSurface);
    return null;
  }, [colorAnalysisMode, selectedSurface]);
  const colorAnalysisDescription = useMemo(() => {
    if (!selectedSurface || colorAnalysisMode === 'off') {
      return 'Выберите режим окраски для активной поверхности.';
    }

    if (colorAnalysisMode === 'explicit-gradient') {
      return selectedSurface.detectedType === 'explicit'
        ? 'Окраска по модулю |grad f(x, y)| для явной поверхности.'
        : 'Этот режим работает только для явных поверхностей z = f(x, y).';
    }
    if (colorAnalysisMode === 'implicit-gradient') {
      return selectedSurface.detectedType === 'implicit'
        ? 'Окраска по модулю |grad F(x, y, z)| для неявной поверхности.'
        : 'Этот режим работает только для неявных поверхностей F(x, y, z) = 0.';
    }
    return 'Окраска по аппроксимации кривизны: чем теплее цвет, тем сильнее изгиб поверхности.';
  }, [colorAnalysisMode, selectedSurface]);
  const sectionLinePositions = useMemo(
    () => {
      if (!showSection || !sectionCurve) return null;
      const circleHint = dynamicSectionSummary?.type.toLowerCase().includes('окруж') ?? false;
      const segments = buildSmoothCurveSegments(sectionCurve.points, sectionCurve.plane, {
        closedHint: circleHint || sectionCurve.curveType === 'circle',
        circleHint,
        sampleCount: 108,
      });
      return buildLineGeometry(segments, 720);
    },
    [showSection, sectionCurve, dynamicSectionSummary]
  );

  const sectionPlaneTransform = useMemo(() => {
    if (!showSection || !sectionCurve) return null;

    const { a, b, c, d } = sectionCurve.plane;
    const normal = new THREE.Vector3(a, c, b);
    if (normal.lengthSq() < 1e-10) return null;
    normal.normalize();

    let centerPoint: [number, number, number] = [0, 0, 0];
    if (sectionCurve.points.length > 0) {
      const sum = sectionCurve.points.reduce<[number, number, number]>(
        (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]],
        [0, 0, 0]
      );
      centerPoint = [
        sum[0] / sectionCurve.points.length,
        sum[1] / sectionCurve.points.length,
        sum[2] / sectionCurve.points.length
      ];
    } else if (selectedSurface?.data?.bounds) {
      const bounds = selectedSurface.data.bounds;
      centerPoint = [
        (bounds.x_min + bounds.x_max) / 2,
        (bounds.y_min + bounds.y_max) / 2,
        (bounds.z_min + bounds.z_max) / 2
      ];
    }

    const planeSize = selectedSurface?.data?.bounds
      ? Math.max(
          selectedSurface.data.bounds.x_max - selectedSurface.data.bounds.x_min,
          selectedSurface.data.bounds.y_max - selectedSurface.data.bounds.y_min,
          selectedSurface.data.bounds.z_max - selectedSurface.data.bounds.z_min
        ) * 1.2
      : 8;

    const point = new THREE.Vector3(centerPoint[0], centerPoint[2], centerPoint[1]);
    const offset = (a * centerPoint[0] + b * centerPoint[1] + c * centerPoint[2] + d) / Math.sqrt(a * a + b * b + c * c);
    point.addScaledVector(normal, -offset);

    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal
    );

    return { point, quaternion, planeSize };
  }, [showSection, sectionCurve, selectedSurface]);

  return (
    <div className={`app ${darkMode ? 'dark-theme' : 'light-theme'}`}>
      {/* Верхнее меню */}
      <div className="top-bar">
        <div className="logo-area">
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/2/2e/Stankin-logo-main-color-ru-rgb%21-01.png" 
            alt="СТАНКИН" 
            className="logo"
          />
          <span className="app-title">Surface Visualizer — обучающая система</span>
        </div>
        <div className="top-actions">
          <button className="info-btn" onClick={handleExportImage}>
            🖼 PNG
          </button>
          <button className="info-btn" onClick={handleExportData}>
            📄 CSV
          </button>
          <button className="info-btn" onClick={() => setShowResults(!showResults)}>
            {showResults ? '📊 Скрыть анализ' : '📊 Показать анализ'}
          </button>
          <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? '☀️ Светлая' : '🌙 Тёмная'}
          </button>
          <button className="info-btn" onClick={() => setShowLearningPanel(!showLearningPanel)}>
            {showLearningPanel ? '📖 Скрыть обучение' : '📖 Показать обучение'}
          </button>
        </div>
      </div>

      <div className="main-container">
        <LeftPanel
          equation={equation}
          setEquation={setEquation}
          detected={detected}
          selectedSurface={selectedSurface}
          selectedSurfaceId={selectedSurfaceId}
          handleChangeColor={handleChangeColor}
          resolution={resolution}
          setResolution={setResolution}
          handleBuildSurface={handleBuildSurface}
          isLoading={isLoading}
          surfaces={surfaces}
          setSelectedSurfaceId={setSelectedSurfaceId}
          handleRemoveSurface={handleRemoveSurface}
          handleToggleVisibility={handleToggleVisibility}
          handleChangeOpacity={handleChangeOpacity}
          handleAddAnotherSurface={handleAddAnotherSurface}
          sectionEquation={sectionEquation}
          setSectionEquation={setSectionEquation}
          handleBuildSection={handleBuildSection}
          showSection={showSection}
          setShowSection={setShowSection}
          handlePresetSection={handlePresetSection}
          levelValue={levelValue}
          setLevelValue={setLevelValue}
          handleBuildLevelLine={handleBuildLevelLine}
          levelLines={levelLines.map((entry) => ({
            id: entry.id,
            value: entry.value,
            pointCount: entry.curve.points.length,
            curveTypeRu: entry.curve.curveTypeRu,
          }))}
          handleRemoveLevelLine={handleRemoveLevelLine}
          handleClearLevelLines={handleClearLevelLines}
          showLevelLines={showLevelLines}
          setShowLevelLines={setShowLevelLines}
          dynamicSectionSummary={dynamicSectionSummary}
          handleAnalyzeEquation={handleAnalyzeEquation}
          showCriticalPoints={showCriticalPoints}
          setShowCriticalPoints={setShowCriticalPoints}
          equationAnalysis={equationAnalysis}
          colorAnalysisMode={colorAnalysisMode}
          setColorAnalysisMode={setColorAnalysisMode}
          colorAnalysisDescription={colorAnalysisDescription}
          showSpecialPoints={showSpecialPoints}
          setShowSpecialPoints={setShowSpecialPoints}
          showRuledGenerators={showRuledGenerators}
          setShowRuledGenerators={setShowRuledGenerators}
          showNormal={showNormal}
          handleShowNormal={handleShowNormal}
          showTangentPlane={showTangentPlane}
          handleShowTangentPlane={handleShowTangentPlane}
          showCurvature={showCurvature}
          handleShowCurvature={handleShowCurvature}
          showIntersections={showIntersections}
          setShowIntersections={setShowIntersections}
          resolvedSystemSummary={resolvedSystemSummary}
          examples={examples}
          loadExample={loadExample}
          totalVertices={totalVertices}
          fps={fps}
          intersectionPoints={intersectionPoints}
          setSelectedPoint={setSelectedPoint}
          setAnalysisResult={setAnalysisResult}
        />

        <SceneViewport
          darkMode={darkMode}
          canvasRef={canvasRef}
          setFps={setFps}
          FPSMonitor={FPSMonitor}
          showSection={showSection}
          sectionPlaneTransform={sectionPlaneTransform}
          sectionLinePositions={sectionLinePositions}
          showLevelLines={showLevelLines}
          levelLinePositions={levelLinePositions}
          showRuledGenerators={showRuledGenerators}
          generatorLinePositions={generatorLinePositions}
          showSpecialPoints={showSpecialPoints}
          specialPointPositions={specialPointPositions}
          showCriticalPoints={showCriticalPoints}
          criticalPointPositions={criticalPointPositions}
          showNormal={showNormal}
          normalPoint={normalPoint}
          showTangentPlane={showTangentPlane}
          tangentPoint={tangentPoint}
          showIntersections={showIntersections}
          intersectionPoints={intersectionPoints}
          intersectionLinePositions={intersectionLinePositions}
          intersectionHighlightPositions={intersectionHighlightPositions}
          surfaces={surfaces}
          selectedSurfaceId={selectedSurfaceId}
          colorAnalysisMode={colorAnalysisMode}
          gradientColors={gradientColors}
          handlePointSelect={handlePointSelect}
          analysisResult={analysisResult}
          isLoading={isLoading}
        />

      </div>

      <ResultsModal
        showResults={showResults}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onClose={() => setShowResults(false)}
        selectedSurfaceEquation={selectedSurface?.equation ?? null}
        selectedPoint={selectedPoint}
        normalPoint={normalPoint}
        curvatureData={curvatureData}
        sectionCurve={displayedSectionCurve}
        sectionEquation={displayedSectionEquation}
        current2DAnalysis={current2DAnalysis}
        sectionAxisViews={sectionAxisViews}
        dynamicSectionSummary={dynamicSectionSummary}
        equationAnalysis={equationAnalysis}
        resolvedSystemSummary={resolvedSystemSummary}
        systemAnalysis={systemAnalysis}
        systemExplanation={systemExplanation}
        intersection2DComponents={intersection2DComponents}
        theoryContent={theoryContent}
        detectedType={detected.type}
        classificationData={classificationData}
      />

      {showLearningPanel && (
        <div className="learning-modal-backdrop" onClick={() => setShowLearningPanel(false)}>
          <div className="learning-modal" onClick={(event) => event.stopPropagation()}>
            <div className="learning-modal-header">
              <div>
                <div className="learning-modal-title">Обучающий модуль</div>
                <div className="learning-modal-subtitle">Теория, подсказки и текущие данные анализа</div>
              </div>
              <button className="learning-modal-close" onClick={() => setShowLearningPanel(false)}>✕</button>
            </div>
            <div className="learning-modal-body">
              <LearningPanel
                surfaceType={detected.type}
                curvatureData={curvatureData || undefined}
                sectionData={sectionCurve || undefined}
                selectedPoint={selectedPoint || undefined}
                normalPoint={normalPoint || undefined}
              />
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-toast">❌ {error}</div>}
    </div>
  );
}

export default App;
