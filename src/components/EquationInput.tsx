// src/components/EquationInput.tsx
import { useState, useRef } from 'react';

interface EquationInputProps {
  onAddSurface: (equation: string) => void;
  onRemoveSurface: (id: string) => void;
  surfaces: Array<{ id: string; equation: string; visible: boolean; color: string }>;
  onToggleVisibility: (id: string) => void;
  onChangeColor: (id: string, color: string) => void;
  isLoading: boolean;
}

const PRESET_EQUATIONS = [
  { name: 'Параболоид', equation: 'z = x^2 + y^2' },
  { name: 'Седло', equation: 'z = x^2 - y^2' },
  { name: 'Сфера', equation: 'x^2 + y^2 + z^2 = 4' },
  { name: 'Конус', equation: 'x^2 + y^2 = z^2' },
  { name: 'Однополостный гиперболоид', equation: 'x^2 + y^2 - z^2 = 1' },
  { name: 'Двуполостный гиперболоид', equation: 'x^2 + y^2 - z^2 = -1' },
  { name: 'Эллипсоид', equation: 'x^2/4 + y^2/9 + z^2/16 = 1' },
  { name: 'Волна', equation: 'z = sin(x) * cos(y)' },
  { name: 'Гауссиан', equation: 'z = exp(-(x^2 + y^2))' },
  { name: 'Кубика Ферма', equation: 'x^3 + y^3 + z^3 = 1' },
  { name: 'Тор (параметрический)', equation: 'x = (3 + cos(v)) * cos(u), y = (3 + cos(v)) * sin(u), z = sin(v)' },
];

export function EquationInput({ onAddSurface, onRemoveSurface, surfaces, onToggleVisibility, onChangeColor, isLoading }: EquationInputProps) {
  const [equation, setEquation] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [detectedType, setDetectedType] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Автоматическое распознавание типа уравнения
  const detectEquationType = (eq: string): string => {
    if (!eq.trim()) return '';
    
    // Проверка на параметрическую запись (содержит = и запятые между x,y,z)
    if (eq.includes('=') && eq.includes(',')) {
      const parts = eq.split(',');
      if (parts.length >= 2 && (parts[0].includes('x=') || parts[0].includes('x ='))) {
        return 'parametric';
      }
    }
    
    // Проверка на неявную форму (содержит z с обеих сторон или три переменные)
    if (eq.includes('=') && (eq.includes('z') || (eq.includes('x') && eq.includes('y')))) {
      const sides = eq.split('=');
      if (sides.length === 2 && !sides[0].trim().startsWith('z') && !sides[0].trim().startsWith('z=')) {
        return 'implicit';
      }
    }
    
    // Проверка на явную форму (начинается с z =)
    if (eq.trim().startsWith('z=') || eq.trim().startsWith('z =')) {
      return 'explicit';
    }
    
    // Если есть только x и y без z
    if (eq.includes('x') && eq.includes('y') && !eq.includes('z')) {
      return 'explicit';
    }
    
    return 'unknown';
  };

  const handleEquationChange = (value: string) => {
    setEquation(value);
    const type = detectEquationType(value);
    if (type === 'explicit') setDetectedType('📈 Явная функция z = f(x, y)');
    else if (type === 'implicit') setDetectedType('🔮 Неявная функция F(x, y, z) = 0');
    else if (type === 'parametric') setDetectedType('🎯 Параметрическая поверхность');
    else setDetectedType(null);
  };

  const handleSubmit = () => {
    if (equation.trim()) {
      onAddSurface(equation);
      setEquation('');
      setDetectedType(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: 20,
      zIndex: 100,
      width: isExpanded ? '420px' : 'auto',
      transition: 'width 0.3s ease'
    }}>
      {/* Заголовок панели */}
      <div style={{
        background: 'linear-gradient(135deg, #0A3D91 0%, #2B7BE4 100%)',
        borderRadius: '16px 16px 0 0',
        padding: '12px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer'
      }} onClick={() => setIsExpanded(!isExpanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/2/2e/Stankin-logo-main-color-ru-rgb%21-01.png" 
            alt="СТАНКИН" 
            style={{ height: '32px', filter: 'brightness(0) invert(1)' }}
          />
          <span style={{ color: 'white', fontWeight: 600 }}>3D Surface Visualizer</span>
        </div>
        <span style={{ color: 'white', fontSize: '20px' }}>{isExpanded ? '▼' : '▲'}</span>
      </div>

      {isExpanded && (
        <div style={{
          background: 'rgba(30, 35, 50, 0.95)',
          backdropFilter: 'blur(12px)',
          borderRadius: '0 0 16px 16px',
          padding: '20px',
          border: '1px solid rgba(43, 123, 228, 0.3)',
          borderTop: 'none'
        }}>
          
          {/* Область ввода как в MATLAB */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ color: '#2B7BE4', fontSize: '12px', fontWeight: 600 }}>
                ➤ Введите уравнение
              </label>
              <span style={{ color: '#6C7A91', fontSize: '10px' }}>Ctrl+Enter → построить</span>
            </div>
            <textarea
              ref={textareaRef}
              value={equation}
              onChange={(e) => handleEquationChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Примеры:&#10;z = x^2 - y^2&#10;x^2 + y^2 + z^2 = 4&#10;x = sin(u)*cos(v), y = sin(u)*sin(v), z = cos(u)"
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                borderRadius: '12px',
                background: '#1A1F2E',
                border: '1px solid #2B7BE4',
                color: '#E8F1FF',
                fontSize: '13px',
                fontFamily: 'monospace',
                resize: 'vertical',
                outline: 'none'
              }}
            />
            {detectedType && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#4A9EFF' }}>
                🔍 Распознано: {detectedType}
              </div>
            )}
          </div>

          {/* Кнопки действий */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !equation.trim()}
              style={{
                flex: 2,
                padding: '10px',
                background: 'linear-gradient(135deg, #0A3D91 0%, #2B7BE4 100%)',
                border: 'none',
                borderRadius: '10px',
                color: 'white',
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              ✨ Добавить поверхность
            </button>
            
            <button
              onClick={() => setShowPresets(!showPresets)}
              style={{
                flex: 1,
                padding: '10px',
                background: '#1A1F2E',
                border: '1px solid #2B7BE4',
                borderRadius: '10px',
                color: '#2B7BE4',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              📚 Примеры
            </button>
          </div>

          {/* Библиотека примеров */}
          {showPresets && (
            <div style={{ marginBottom: '20px', maxHeight: '200px', overflowY: 'auto' }}>
              <div style={{ fontSize: '12px', color: '#6C7A91', marginBottom: '8px' }}>Быстрый выбор:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {PRESET_EQUATIONS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setEquation(preset.equation);
                      handleEquationChange(preset.equation);
                      setShowPresets(false);
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#1A1F2E',
                      border: '1px solid #3A4A6E',
                      borderRadius: '20px',
                      color: '#B0C4FF',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#2B7BE4'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3A4A6E'}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Список активных поверхностей */}
          {surfaces.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: '#6C7A91', marginBottom: '8px' }}>
                📌 Активные поверхности ({surfaces.length})
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {surfaces.map((surface) => (
                  <div
                    key={surface.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px',
                      marginBottom: '6px',
                      background: '#1A1F2E',
                      borderRadius: '8px',
                      border: '1px solid #2A3A5A'
                    }}
                  >
                    <button
                      onClick={() => onToggleVisibility(surface.id)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: surface.visible ? '#2B7BE4' : '#3A4A6E',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      {surface.visible ? '👁' : '👁‍🗨'}
                    </button>
                    
                    <input
                      type="color"
                      value={surface.color}
                      onChange={(e) => onChangeColor(surface.id, e.target.value)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        border: '1px solid #3A4A6E',
                        cursor: 'pointer',
                        background: 'transparent'
                      }}
                    />
                    
                    <div style={{ flex: 1, fontSize: '11px', fontFamily: 'monospace', color: '#E8F1FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {surface.equation.length > 40 ? surface.equation.substring(0, 40) + '...' : surface.equation}
                    </div>
                    
                    <button
                      onClick={() => onRemoveSurface(surface.id)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: '#E53935',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Подсказка */}
          <div style={{ marginTop: '16px', fontSize: '10px', color: '#4A5A7A', textAlign: 'center', borderTop: '1px solid #2A3A5A', paddingTop: '12px' }}>
            💡 Система автоматически определяет тип поверхности<br/>
            🔄 Можно добавлять несколько поверхностей одновременно<br/>
            🎨 Каждая поверхность имеет свой цвет и видимость
          </div>
        </div>
      )}
    </div>
  );
}
