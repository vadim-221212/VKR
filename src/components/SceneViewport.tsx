import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SurfaceMesh } from './SurfaceMesh';
import type { IntersectionPoint, Surface } from '../types/surface';

interface SceneViewportProps {
  darkMode: boolean;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  setFps: (fps: number) => void;
  FPSMonitor: React.ComponentType<{ onFPSUpdate: (fps: number) => void }>;
  showSection: boolean;
  sectionPlaneTransform: { point: THREE.Vector3; quaternion: THREE.Quaternion; planeSize: number } | null;
  sectionLinePositions: THREE.BufferGeometry | null;
  showLevelLines: boolean;
  levelLinePositions: THREE.BufferGeometry | null;
  showRuledGenerators: boolean;
  generatorLinePositions: THREE.BufferGeometry | null;
  showSpecialPoints: boolean;
  specialPointPositions: THREE.BufferGeometry | null;
  showCriticalPoints: boolean;
  criticalPointPositions: THREE.BufferGeometry | null;
  showNormal: boolean;
  normalPoint: { x: number; y: number; z: number } | null;
  showTangentPlane: boolean;
  tangentPoint: { x: number; y: number; z: number } | null;
  showIntersections: boolean;
  intersectionPoints: IntersectionPoint[];
  intersectionLinePositions: THREE.BufferGeometry | null;
  intersectionHighlightPositions: THREE.BufferGeometry | null;
  surfaces: Surface[];
  selectedSurfaceId: string | null;
  colorAnalysisMode: 'off' | 'explicit-gradient' | 'implicit-gradient' | 'curvature';
  gradientColors: number[][] | null;
  handlePointSelect: (point: { x: number; y: number; z: number }, surfaceId: string) => void;
  analysisResult: string;
  isLoading: boolean;
}

export function SceneViewport(props: SceneViewportProps) {
  const {
    darkMode,
    canvasRef,
    setFps,
    FPSMonitor,
    showSection,
    sectionPlaneTransform,
    sectionLinePositions,
    showLevelLines,
    levelLinePositions,
    showRuledGenerators,
    generatorLinePositions,
    showSpecialPoints,
    specialPointPositions,
    showCriticalPoints,
    criticalPointPositions,
    showNormal,
    normalPoint,
    showTangentPlane,
    tangentPoint,
    showIntersections,
    intersectionPoints,
    intersectionLinePositions,
    intersectionHighlightPositions,
    surfaces,
    selectedSurfaceId,
    colorAnalysisMode,
    gradientColors,
    handlePointSelect,
    analysisResult,
    isLoading,
  } = props;
  const sampledIntersectionPoints = intersectionPoints.filter((_, index) => {
    const stride = Math.max(1, Math.ceil(intersectionPoints.length / 24));
    return index % stride === 0;
  });
  const sceneBackground = darkMode ? '#0A0F1A' : '#F3F7FF';
  const gridMajor = darkMode ? '#4A6A9A' : '#9BB8E6';
  const gridMinor = darkMode ? '#2A3A5A' : '#D2DFF5';
  const ambientIntensity = darkMode ? 0.5 : 0.72;
  const pointLightIntensity = darkMode ? 1 : 1.15;

  return (
    <div className="canvas-area">
      <Canvas
        camera={{ position: [8, 8, 8], fov: 50 }}
        style={{ background: sceneBackground }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          canvasRef.current = gl.domElement;
        }}
      >
        <FPSMonitor onFPSUpdate={setFps} />

        <ambientLight intensity={ambientIntensity} />
        <pointLight position={[10, 10, 10]} intensity={pointLightIntensity} />
        <gridHelper args={[20, 20, gridMajor, gridMinor]} position={[0, -2, 0]} />
        <axesHelper args={[6]} />

        {showSection && sectionPlaneTransform && (
          <mesh position={sectionPlaneTransform.point} quaternion={sectionPlaneTransform.quaternion}>
            <planeGeometry args={[sectionPlaneTransform.planeSize, sectionPlaneTransform.planeSize]} />
            <meshStandardMaterial color="#FF6B6B" transparent opacity={0.3} side={2} />
          </mesh>
        )}

        {showSection && sectionLinePositions && (
          <lineSegments geometry={sectionLinePositions}>
            <lineBasicMaterial color="#FFD166" linewidth={2} />
          </lineSegments>
        )}
        {showLevelLines && levelLinePositions && (
          <lineSegments geometry={levelLinePositions}>
            <lineBasicMaterial color="#62E6FF" linewidth={2} />
          </lineSegments>
        )}
        {showRuledGenerators && generatorLinePositions && (
          <lineSegments geometry={generatorLinePositions}>
            <lineBasicMaterial color="#FF9F1C" linewidth={2} />
          </lineSegments>
        )}
        {showSpecialPoints && specialPointPositions && (
          <points geometry={specialPointPositions}>
            <pointsMaterial color="#FF5D73" size={0.16} sizeAttenuation />
          </points>
        )}
        {showCriticalPoints && criticalPointPositions && (
          <points geometry={criticalPointPositions}>
            <pointsMaterial color="#4ECDC4" size={0.18} sizeAttenuation />
          </points>
        )}

        {showNormal && normalPoint && (
          <arrowHelper
            args={[
              new THREE.Vector3(normalPoint.x, normalPoint.z, normalPoint.y).normalize(),
              new THREE.Vector3(normalPoint.x, normalPoint.z, normalPoint.y),
              1.2,
              0xffd700
            ]}
          />
        )}

        {showTangentPlane && tangentPoint && (
          <mesh position={[tangentPoint.x, tangentPoint.z, tangentPoint.y]}>
            <planeGeometry args={[2, 2]} />
            <meshStandardMaterial color="#4ECDC4" transparent opacity={0.5} side={2} />
          </mesh>
        )}

        {showIntersections && intersectionLinePositions && (
          <>
            <lineSegments geometry={intersectionLinePositions}>
              <lineBasicMaterial color={darkMode ? "#FFE08A" : "#F4A300"} linewidth={3} />
            </lineSegments>
            {intersectionHighlightPositions && (
              <points geometry={intersectionHighlightPositions}>
                <pointsMaterial
                  color={darkMode ? "#FFE8A3" : "#FFB400"}
                  size={darkMode ? 0.07 : 0.08}
                  sizeAttenuation
                />
              </points>
            )}
          </>
        )}
        {showIntersections && !intersectionLinePositions && sampledIntersectionPoints.map((ip, idx) => (
          <mesh key={idx} position={[ip.point.x, ip.point.z, ip.point.y]}>
            <sphereGeometry args={[0.06, 14, 14]} />
            <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.35} />
          </mesh>
        ))}

        <OrbitControls enablePan enableZoom enableRotate zoomSpeed={1.2} rotateSpeed={1.2} target={[0, 0, 0]} />

        {surfaces.map((surface) => (
          surface.visible && surface.data && (
            <SurfaceMesh
              key={surface.id}
              vertices={surface.data.vertices}
              indices={surface.data.indices}
              normals={surface.data.normals}
              vertexColors={colorAnalysisMode !== 'off' && surface.id === selectedSurfaceId ? gradientColors ?? undefined : undefined}
              color={surface.color}
              opacity={surface.opacity}
              surfaceId={surface.id}
              showEdges
              onPointClick={handlePointSelect}
            />
          )
        ))}
      </Canvas>

      {analysisResult && <div className="result-toast">{analysisResult}</div>}
      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <div>Построение поверхности...</div>
        </div>
      )}
    </div>
  );
}
