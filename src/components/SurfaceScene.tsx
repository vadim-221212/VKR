// src/components/SurfaceScene.tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SurfaceMesh } from './SurfaceMesh';
import type { SurfaceResponse } from '../types/surface';

interface SurfaceSceneProps {
  surfaceData: SurfaceResponse | null;
  isLoading: boolean;
  lineWidth?: number;
  onPointSelect?: (point: { x: number; y: number; z: number }, surfaceId: string) => void;
}

export function SurfaceScene({ surfaceData, isLoading, lineWidth = 1, onPointSelect }: SurfaceSceneProps) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [8, 8, 8], fov: 50 }}
        style={{ 
          background: '#0A0F1A',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        
        {/* Сетка на плоскости XY (горизонтальная) */}
        <gridHelper args={[20, 20, '#4A6A9A', '#2A3A5A']} position={[0, -2, 0]} />
        
        {/* Оси координат: X - красный, Y - зелёный, Z - синий */}
        <axesHelper args={[6]} />

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          zoomSpeed={1.2}
          rotateSpeed={1.2}
          target={[0, 0, 0]}
        />

        {surfaceData && !isLoading && (
          <SurfaceMesh
            vertices={surfaceData.vertices}
            indices={surfaceData.indices}
            normals={surfaceData.normals}
            color="#2B7BE4"
            opacity={0.9}
            surfaceId="main"
            showEdges={lineWidth > 0}
            onPointClick={onPointSelect}
          />
        )}
      </Canvas>

      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.8)',
          padding: '20px',
          borderRadius: '10px',
          color: 'white',
          zIndex: 10
        }}>
          Построение поверхности...
        </div>
      )}
    </div>
  );
}
