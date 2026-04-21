interface ControlsProps {
  onResetView: () => void;
  onToggleWireframe: () => void;
  onToggleAxes: () => void;
  onScreenshot: () => void;
  isWireframe: boolean;
  showAxes: boolean;
}

export function Controls({ 
  onResetView, 
  onToggleWireframe, 
  onToggleAxes, 
  onScreenshot,
  isWireframe,
  showAxes
}: ControlsProps) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      borderRadius: '30px',
      padding: '8px 16px',
      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
      border: '1px solid rgba(43, 123, 228, 0.3)',
      display: 'flex',
      gap: '8px'
    }}>
      {/* Кнопка сброса вида */}
      <button
        onClick={onResetView}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '10px 14px',
          borderRadius: '20px',
          cursor: 'pointer',
          fontSize: '16px',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#1A2C3E'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#F0F4FF'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        title="Сбросить вид камеры"
      >
        🎯 <span style={{ fontSize: '12px' }}>Сброс</span>
      </button>

      {/* Кнопка каркасного режима */}
      <button
        onClick={onToggleWireframe}
        style={{
          background: isWireframe ? '#2B7BE4' : 'transparent',
          border: 'none',
          padding: '10px 14px',
          borderRadius: '20px',
          cursor: 'pointer',
          fontSize: '16px',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: isWireframe ? 'white' : '#1A2C3E'
        }}
        onMouseEnter={(e) => {
          if (!isWireframe) e.currentTarget.style.background = '#F0F4FF';
        }}
        onMouseLeave={(e) => {
          if (!isWireframe) e.currentTarget.style.background = 'transparent';
        }}
        title="Каркасный режим"
      >
        🔲 <span style={{ fontSize: '12px' }}>Каркас</span>
      </button>

      {/* Кнопка показа осей */}
      <button
        onClick={onToggleAxes}
        style={{
          background: showAxes ? '#2B7BE4' : 'transparent',
          border: 'none',
          padding: '10px 14px',
          borderRadius: '20px',
          cursor: 'pointer',
          fontSize: '16px',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: showAxes ? 'white' : '#1A2C3E'
        }}
        onMouseEnter={(e) => {
          if (!showAxes) e.currentTarget.style.background = '#F0F4FF';
        }}
        onMouseLeave={(e) => {
          if (!showAxes) e.currentTarget.style.background = 'transparent';
        }}
        title="Показать/скрыть оси"
      >
        📐 <span style={{ fontSize: '12px' }}>Оси</span>
      </button>

      {/* Кнопка скриншота */}
      <button
        onClick={onScreenshot}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '10px 14px',
          borderRadius: '20px',
          cursor: 'pointer',
          fontSize: '16px',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#1A2C3E'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#F0F4FF'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        title="Сделать скриншот"
      >
        📸 <span style={{ fontSize: '12px' }}>Скриншот</span>
      </button>
    </div>
  );
}
