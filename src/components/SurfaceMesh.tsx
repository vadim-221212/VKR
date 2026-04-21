import { useMemo, useRef } from 'react';
import { BufferGeometry, EdgesGeometry, Float32BufferAttribute, LineSegments, Mesh } from 'three';

interface SurfaceMeshProps {
  vertices: number[][];
  indices: number[];
  normals?: number[][];
  vertexColors?: number[][];
  color?: string;
  opacity?: number;
  surfaceId: string;
  showEdges?: boolean;
  onPointClick?: (point: { x: number; y: number; z: number }, surfaceId: string) => void;
}

export function SurfaceMesh({
  vertices, indices,
  normals,
  vertexColors,
  color = '#2B7BE4', opacity = 0.9,
  surfaceId, 
  showEdges = true,
  onPointClick 
}: SurfaceMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const linesRef = useRef<LineSegments>(null);

  const geometry = useMemo(() => {
    if (!vertices.length || !indices.length) return null;
    
    const geom = new BufferGeometry();
    
    const positions = new Float32Array(vertices.length * 3);
    vertices.forEach((v, i) => {
      positions[i * 3] = v[0];
      positions[i * 3 + 1] = v[2];
      positions[i * 3 + 2] = v[1];
    });
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);

    if (normals && normals.length === vertices.length) {
      const normalBuffer = new Float32Array(normals.length * 3);
      normals.forEach((n, i) => {
        normalBuffer[i * 3] = n[0];
        normalBuffer[i * 3 + 1] = n[2];
        normalBuffer[i * 3 + 2] = n[1];
      });
      geom.setAttribute('normal', new Float32BufferAttribute(normalBuffer, 3));
    } else {
      geom.computeVertexNormals();
    }

    if (vertexColors && vertexColors.length === vertices.length) {
      const colorBuffer = new Float32Array(vertexColors.length * 3);
      vertexColors.forEach((c, i) => {
        colorBuffer[i * 3] = c[0];
        colorBuffer[i * 3 + 1] = c[1];
        colorBuffer[i * 3 + 2] = c[2];
      });
      geom.setAttribute('color', new Float32BufferAttribute(colorBuffer, 3));
    }
    
    return geom;
  }, [vertices, indices, normals, vertexColors]);

  const edgesGeometry = useMemo(() => {
    if (!geometry || !showEdges) return null;
    return new EdgesGeometry(geometry, 20);
  }, [geometry, showEdges]);

  const handleClick = (event: any) => {
    if (!onPointClick || !meshRef.current) return;
    const point = event.point;
    onPointClick({ 
      x: point.x, 
      y: point.z,
      z: point.y
    }, surfaceId);
  };

  if (!geometry) return null;

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geometry}
        onClick={handleClick}
      >
        <meshStandardMaterial
          color={vertexColors ? '#ffffff' : color}
          vertexColors={Boolean(vertexColors)}
          transparent
          opacity={opacity}
          side={2}
          metalness={0.08}
          roughness={0.45}
        />
      </mesh>

      {edgesGeometry && (
        <lineSegments ref={linesRef} geometry={edgesGeometry}>
          <lineBasicMaterial color="#ffffff" transparent opacity={Math.min(opacity, 0.35)} />
        </lineSegments>
      )}
    </group>
  );
}
