import type { IntersectionPoint } from '../types/surface';

interface IntersectionPointsProps {
  points: IntersectionPoint[];
  onPointClick?: (point: IntersectionPoint) => void;
}

export function IntersectionPoints({ points, onPointClick }: IntersectionPointsProps) {
  if (points.length === 0) return null;

  return (
    <div className="intersection-panel">
      <div className="intersection-header">
        <span>🔗 Точки пересечения</span>
        <span className="intersection-count">{points.length}</span>
      </div>
      <div className="intersection-list">
        {points.map((ip, idx) => (
          <div 
            key={idx} 
            className="intersection-item"
            onClick={() => onPointClick?.(ip)}
          >
            <div className="intersection-coords">
              ({ip.point.x.toFixed(2)}, {ip.point.y.toFixed(2)}, {ip.point.z.toFixed(2)})
            </div>
            <div className="intersection-surfaces">
              {ip.surfaceIds.length} поверхностей
            </div>
            <div className="intersection-type">
              {ip.type === 'intersection' ? 'Пересечение' : 'Сечение'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
