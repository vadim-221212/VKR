// src/components/InfoPanel.tsx
import type { Surface } from '../types/surface';

interface InfoPanelProps {
  surfaces: Surface[];
  selectedPoint: { x: number; y: number; z: number } | null;
}

export function InfoPanel({ surfaces, selectedPoint }: InfoPanelProps) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      zIndex: 100,
      background: 'rgba(30, 35, 50, 0.95)',
      backdropFilter: 'blur(12px)',
      borderRadius: '16px',
      width: '280px',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
      border: '1px solid rgba(43, 123, 228, 0.3)',
      overflow: 'hidden'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0A3D91 0%, #2B7BE4 100%)',
        padding: '12px 16px',
        color: 'white'
      }}>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>📊 Информация</h4>
      </div>

      <div style={{ padding: '16px' }}>
        {surfaces.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#6C7A91', marginBottom: '8px' }}>📐 Поверхности</div>
            {surfaces.map(s => (
              <div key={s.id} style={{ fontSize: '12px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', background: s.color }}></span>
                <span style={{ color: '#E8F1FF', fontFamily: 'monospace', fontSize: '10px' }}>
                  {s.equation.length > 35 ? s.equation.substring(0, 35) + '...' : s.equation}
                </span>
                <span style={{ color: '#4A9EFF', fontSize: '10px' }}>
                  {s.data?.vertices.length ? `${s.data.vertices.length} вершин` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {selectedPoint && (
          <div>
            <div style={{ fontSize: '11px', color: '#6C7A91', marginBottom: '8px' }}>📍 Выбранная точка</div>
            <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#4A9EFF' }}>
              x = {selectedPoint.x.toFixed(4)}<br />
              y = {selectedPoint.y.toFixed(4)}<br />
              z = {selectedPoint.z.toFixed(4)}
            </div>
          </div>
        )}

        {surfaces.length === 0 && !selectedPoint && (
          <div style={{ textAlign: 'center', color: '#6C7A91', fontSize: '12px' }}>
            Добавьте поверхность<br />
            через панель слева
          </div>
        )}
      </div>
    </div>
  );
}