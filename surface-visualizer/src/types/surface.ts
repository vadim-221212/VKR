// src/types/surface.ts

export type SurfaceType = 'explicit' | 'implicit' | 'parametric' | 'unknown';

export interface SurfaceStats {
  vertices: number;
  triangles: number;
  time: number;
}

export interface CurvatureData {
  E: number;
  F: number;
  G: number;
  L: number;
  M: number;
  N: number;
  gaussian: number;
  mean: number;
  principal1: number;
  principal2: number;
  pointType: 'elliptic' | 'hyperbolic' | 'parabolic' | 'planar';
  pointTypeRu: string;
}

export interface SectionData {
  planeEquation: string;
  plane: {
    a: number;
    b: number;
    c: number;
    d: number;
  };
  curveType: 'ellipse' | 'hyperbola' | 'parabola' | 'circle' | 'line' | 'spatial' | 'unknown';
  curveTypeRu: string;
  points: number[][];
  segments: number[][][];
}

export interface IntersectionPoint {
  point: { x: number; y: number; z: number };
  surfaceIds: string[];
  type: 'intersection' | 'section';
}

export interface Surface {
  id: string;
  equation: string;
  detectedType: SurfaceType;
  request?: SurfaceRequest;
  color: string;
  visible: boolean;
  opacity: number;
  resolution: number;
  bounds: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
    z_min?: number;
    z_max?: number;
  };
  data?: SurfaceResponse;
  stats?: SurfaceStats;
  isSelected?: boolean;
}

export interface SurfaceResponse {
  vertices: number[][];
  indices: number[];
  normals?: number[][];
  bounds: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
    z_min: number;
    z_max: number;
  };
  computation_time: number;
}

export interface SurfaceRequest {
  equation: string;
  surface_type: string;
  x_min?: number;
  x_max?: number;
  y_min?: number;
  y_max?: number;
  z_min?: number;
  z_max?: number;
  resolution: number;
  param_u_min?: number;
  param_u_max?: number;
  param_v_min?: number;
  param_v_max?: number;
  param_x_expr?: string;
  param_y_expr?: string;
  param_z_expr?: string;
}

export interface NormalRequest {
  equation: string;
  surface_type: string;
  x: number;
  y: number;
  z?: number;
  u?: number;
  v?: number;
  param_x_expr?: string;
  param_y_expr?: string;
  param_z_expr?: string;
}

export interface NormalResponse {
  normal: number[];
  normalized_normal: number[];
}

export interface CurvatureRequest {
  equation: string;
  surface_type: string;
  x?: number;
  y?: number;
  z?: number;
  u?: number;
  v?: number;
  param_x_expr?: string;
  param_y_expr?: string;
  param_z_expr?: string;
}

export interface CurvatureResponse {
  E: number;
  F: number;
  G: number;
  L: number;
  M: number;
  N: number;
  gaussian: number;
  mean: number;
  principal1: number;
  principal2: number;
  point_type: 'elliptic' | 'hyperbolic' | 'parabolic' | 'planar';
  point_type_ru: string;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface LearningMaterial {
  title: string;
  content: string;
  formula?: string;
  example?: string;
}

export interface CriticalPointData {
  x: number;
  y: number;
  z: number;
  point_type: 'minimum' | 'maximum' | 'saddle' | 'degenerate';
  point_type_ru: string;
}

export interface EquationAnalysisRequest {
  equation: string;
  surface_type: string;
  param_x_expr?: string;
  param_y_expr?: string;
  param_z_expr?: string;
}

export interface EquationAnalysisResponse {
  zero_level: string;
  xoy_intersection: string;
  xoz_intersection: string;
  yoz_intersection: string;
  critical_points: CriticalPointData[];
  extrema_summary: string;
}

export interface SurfaceDescriptor {
  equation: string;
  surface_type: string;
  param_x_expr?: string;
  param_y_expr?: string;
  param_z_expr?: string;
}

export interface SystemAnalysisRequest {
  surface_a: SurfaceDescriptor;
  surface_b: SurfaceDescriptor;
}

export interface SystemAnalysisResponse {
  title: string;
  formula: string;
  detail: string;
  curve_type: string;
  radius?: number | null;
  solutions: string[];
}
