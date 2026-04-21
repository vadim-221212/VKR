import { IntersectionPoints } from './IntersectionPoints';
import type { EquationAnalysisResponse, IntersectionPoint, Surface, SurfaceType } from '../types/surface';

interface LeftPanelProps {
  equation: string;
  setEquation: (value: string) => void;
  detected: { type: SurfaceType; displayName: string; icon: string };
  selectedSurface?: Surface;
  selectedSurfaceId: string | null;
  handleChangeColor: (id: string, color: string) => void;
  resolution: number;
  setResolution: (value: number) => void;
  handleBuildSurface: () => void;
  isLoading: boolean;
  surfaces: Surface[];
  setSelectedSurfaceId: (id: string) => void;
  handleRemoveSurface: (id: string) => void;
  handleToggleVisibility: (id: string) => void;
  handleChangeOpacity: (id: string, opacity: number) => void;
  handleAddAnotherSurface: () => void;
  sectionEquation: string;
  setSectionEquation: (value: string) => void;
  handleBuildSection: () => void;
  showSection: boolean;
  setShowSection: (value: boolean) => void;
  handlePresetSection: (axis: 'x' | 'y') => void;
  levelValue: number;
  setLevelValue: (value: number) => void;
  handleBuildLevelLine: () => void;
  levelLines: Array<{ id: string; value: number; pointCount: number; curveTypeRu: string }>;
  handleRemoveLevelLine: (id: string) => void;
  handleClearLevelLines: () => void;
  showLevelLines: boolean;
  setShowLevelLines: (value: boolean) => void;
  dynamicSectionSummary: { type: string; equation: string; detail: string; radius: number | null } | null;
  handleAnalyzeEquation: () => void;
  showCriticalPoints: boolean;
  setShowCriticalPoints: (value: boolean) => void;
  equationAnalysis: EquationAnalysisResponse | null;
  colorAnalysisMode: 'off' | 'explicit-gradient' | 'implicit-gradient' | 'curvature';
  setColorAnalysisMode: (value: 'off' | 'explicit-gradient' | 'implicit-gradient' | 'curvature' | ((current: 'off' | 'explicit-gradient' | 'implicit-gradient' | 'curvature') => 'off' | 'explicit-gradient' | 'implicit-gradient' | 'curvature')) => void;
  colorAnalysisDescription: string;
  showSpecialPoints: boolean;
  setShowSpecialPoints: (value: boolean) => void;
  showRuledGenerators: boolean;
  setShowRuledGenerators: (value: boolean) => void;
  showNormal: boolean;
  handleShowNormal: () => void;
  showTangentPlane: boolean;
  handleShowTangentPlane: () => void;
  showCurvature: boolean;
  handleShowCurvature: () => void;
  showIntersections: boolean;
  setShowIntersections: (value: boolean) => void;
  resolvedSystemSummary: { title: string; formula: string; detail: string; radius: number | null };
  examples: Array<{ name: string; eq: string; desc: string }>;
  loadExample: (eq: string) => void;
  totalVertices: number;
  fps: number;
  intersectionPoints: IntersectionPoint[];
  setSelectedPoint: (point: { x: number; y: number; z: number; surfaceId: string }) => void;
  setAnalysisResult: (value: string) => void;
}

export function LeftPanel(props: LeftPanelProps) {
  const {
    equation,
    setEquation,
    detected,
    selectedSurface,
    selectedSurfaceId,
    handleChangeColor,
    resolution,
    setResolution,
    handleBuildSurface,
    isLoading,
    surfaces,
    setSelectedSurfaceId,
    handleRemoveSurface,
    handleToggleVisibility,
    handleChangeOpacity,
    handleAddAnotherSurface,
    sectionEquation,
    setSectionEquation,
    handleBuildSection,
    showSection,
    setShowSection,
    handlePresetSection,
    levelValue,
    setLevelValue,
    handleBuildLevelLine,
    levelLines,
    handleRemoveLevelLine,
    handleClearLevelLines,
    showLevelLines,
    setShowLevelLines,
    dynamicSectionSummary,
    handleAnalyzeEquation,
    showCriticalPoints,
    setShowCriticalPoints,
    equationAnalysis,
    colorAnalysisMode,
    setColorAnalysisMode,
    colorAnalysisDescription,
    showSpecialPoints,
    setShowSpecialPoints,
    showRuledGenerators,
    setShowRuledGenerators,
    showNormal,
    handleShowNormal,
    showTangentPlane,
    handleShowTangentPlane,
    showCurvature,
    handleShowCurvature,
    showIntersections,
    setShowIntersections,
    resolvedSystemSummary,
    examples,
    loadExample,
    totalVertices,
    fps,
    intersectionPoints,
    setSelectedPoint,
    setAnalysisResult,
  } = props;

  return (
    <div className="input-panel">
      <div className="input-panel-scroll">
        <div className="input-card">
          <div className="card-title">📝 Введите уравнение поверхности</div>
          <textarea
            className="equation-field"
            value={equation}
            onChange={(e) => setEquation(e.target.value)}
            placeholder="Примеры:&#10;• x^2 + y^2&#10;• x^2 + y^2 + z^2 = 9&#10;• x = (3 + cos(v)) * cos(u)&#10;  y = (3 + cos(v)) * sin(u)&#10;  z = sin(v)"
            rows={5}
          />
          <div className="detection-badge">{detected.icon} {detected.displayName}</div>

          <div className="controls-row">
            <div className="control-group">
              <label>🎨 Цвет поверхности</label>
              <input
                type="color"
                value={selectedSurface?.color || '#2B7BE4'}
                onChange={(e) => {
                  if (selectedSurfaceId) handleChangeColor(selectedSurfaceId, e.target.value);
                }}
                className="color-picker"
              />
            </div>
            <div className="control-group">
              <label>📐 Качество сетки</label>
              <div className="slider-group">
                <input type="range" min="50" max="150" value={resolution} onChange={(e) => setResolution(parseInt(e.target.value))} />
                <span>{resolution}×{resolution}</span>
              </div>
            </div>
          </div>

          <button className="build-button" onClick={handleBuildSurface} disabled={isLoading}>
            {isLoading ? '🔄 Построение...' : '🚀 Построить поверхность'}
          </button>
        </div>

        <div className="surfaces-card">
          <div className="card-title">📌 Активные поверхности ({surfaces.length})</div>
          <div className="surfaces-grid">
            {surfaces.length === 0 && <div className="empty-grid">Нет поверхностей.<br />Введите уравнение выше</div>}
            {surfaces.map((surface) => (
              <div key={surface.id} className={`surface-tile ${selectedSurfaceId === surface.id ? 'selected' : ''}`} onClick={() => setSelectedSurfaceId(surface.id)}>
                <div className="tile-header">
                  <div className="tile-color" style={{ background: surface.color }} />
                  <div className="tile-name">{surface.equation.length > 35 ? `${surface.equation.substring(0, 35)}...` : surface.equation}</div>
                  <button className="tile-close" onClick={(e) => { e.stopPropagation(); handleRemoveSurface(surface.id); }}>✕</button>
                </div>
                <div className="tile-stats">
                  <span>📊 {surface.stats?.vertices.toLocaleString()} вершин</span>
                  <span>🔺 {surface.stats?.triangles.toLocaleString()} тр-ков</span>
                  <button className="tile-eye" onClick={(e) => { e.stopPropagation(); handleToggleVisibility(surface.id); }}>
                    {surface.visible ? '👁' : '👁‍🗨'}
                  </button>
                </div>
                {selectedSurfaceId === surface.id && (
                  <div className="tile-controls">
                    <div className="control-row">
                      <span>Прозрачность:</span>
                      <input type="range" min="0.2" max="1" step="0.01" value={surface.opacity} onChange={(e) => handleChangeOpacity(surface.id, parseFloat(e.target.value))} />
                      <span>{Math.round(surface.opacity * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button className="add-surface-btn" onClick={handleAddAnotherSurface}>+ Добавить ещё одну поверхность</button>
        </div>

        <div className="tools-card">
          <div className="card-title">🔧 Инструменты анализа</div>
          <div className="tools-grid">
            <div className="tool-item tool-item-wide">
              <div className="tool-icon">✂️</div>
              <div className="tool-content">
                <div className="tool-name">Метод сечений</div>
                <div className="tool-description">Задайте плоскость как уравнение и посмотрите линию пересечения с поверхностью.</div>
                <div className="tool-control tool-control-wide">
                  <input type="text" value={sectionEquation} onChange={(e) => setSectionEquation(e.target.value)} placeholder="x + y + z - 2 = 0" />
                  <button onClick={handleBuildSection}>Построить</button>
                  <button onClick={() => setShowSection(false)} disabled={!showSection}>Скрыть</button>
                </div>
                <div className="tool-presets">
                  <button className="tool-action" onClick={() => handlePresetSection('x')}>X = 0</button>
                  <button className="tool-action" onClick={() => handlePresetSection('y')}>Y = 0</button>
                </div>
              </div>
            </div>

            <div className="tool-item">
              <div className="tool-icon">📏</div>
              <div className="tool-content">
                <div className="tool-name">Линии уровня</div>
                <div className="tool-description">Добавляйте несколько горизонтальных сечений `z = const` и сравнивайте их одновременно.</div>
                <div className="tool-control">
                  <input type="number" value={levelValue} onChange={(e) => setLevelValue(parseFloat(e.target.value))} step="0.5" />
                  <button onClick={handleBuildLevelLine}>Добавить</button>
                  <button onClick={() => setShowLevelLines(!showLevelLines)} disabled={levelLines.length === 0}>
                    {showLevelLines ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
                {selectedSurface?.data?.bounds && (
                  <input
                    className="level-slider"
                    type="range"
                    min={selectedSurface.data.bounds.z_min}
                    max={selectedSurface.data.bounds.z_max}
                    step="0.1"
                    value={levelValue}
                    onChange={(e) => {
                      setLevelValue(parseFloat(e.target.value));
                      if (!showLevelLines) setShowLevelLines(true);
                    }}
                  />
                )}
                {showLevelLines && dynamicSectionSummary && (
                  <div className="tool-summary">
                    <strong>Сечение z = {levelValue.toFixed(2)}</strong><br />
                    Тип: {dynamicSectionSummary.type}<br />
                    Формула: {dynamicSectionSummary.equation}
                  </div>
                )}
                {levelLines.length > 0 && (
                  <div className="level-lines-list">
                    <div className="level-lines-header">
                      <strong>Добавленные уровни</strong>
                      <button className="tool-action" onClick={handleClearLevelLines}>Очистить</button>
                    </div>
                    {levelLines.map((entry) => (
                      <div key={entry.id} className="level-line-chip">
                        <div>
                          <strong>z = {entry.value.toFixed(2)}</strong>
                          <span>{entry.curveTypeRu}, {entry.pointCount} точек</span>
                        </div>
                        <button className="tool-action" onClick={() => handleRemoveLevelLine(entry.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="tool-item">
              <div className="tool-icon">🧠</div>
              <div className="tool-content">
                <div className="tool-name">Решатель</div>
                <div className="tool-description">Корни при z = 0, координатные плоскости, экстремумы.</div>
                <div className="tool-control">
                  <button onClick={handleAnalyzeEquation}>Анализировать</button>
                  <button onClick={() => setShowCriticalPoints(!showCriticalPoints)} disabled={!equationAnalysis}>
                    {showCriticalPoints ? 'Скрыть точки' : 'Показать точки'}
                  </button>
                </div>
              </div>
            </div>

            <div className="tool-item">
              <div className="tool-icon">🌈</div>
              <div className="tool-content">
                <div className="tool-name">Окраска</div>
                <div className="tool-presets">
                  <button className={`tool-action ${colorAnalysisMode === 'explicit-gradient' ? 'active' : ''}`} onClick={() => setColorAnalysisMode((current) => current === 'explicit-gradient' ? 'off' : 'explicit-gradient')}>∇f</button>
                  <button className={`tool-action ${colorAnalysisMode === 'implicit-gradient' ? 'active' : ''}`} onClick={() => setColorAnalysisMode((current) => current === 'implicit-gradient' ? 'off' : 'implicit-gradient')}>∇F</button>
                  <button className={`tool-action ${colorAnalysisMode === 'curvature' ? 'active' : ''}`} onClick={() => setColorAnalysisMode((current) => current === 'curvature' ? 'off' : 'curvature')}>K</button>
                </div>
                <div className="tool-summary">{colorAnalysisDescription}</div>
              </div>
            </div>

            <div className="tool-item">
              <div className="tool-icon">🧭</div>
              <div className="tool-content">
                <div className="tool-name">Классификация</div>
                <div className="tool-presets">
                  <button className={`tool-action ${showSpecialPoints ? 'active' : ''}`} onClick={() => setShowSpecialPoints(!showSpecialPoints)}>Особые точки</button>
                  <button className={`tool-action ${showRuledGenerators ? 'active' : ''}`} onClick={() => setShowRuledGenerators(!showRuledGenerators)}>Образующие</button>
                </div>
              </div>
            </div>

            <div className="tool-item">
              <div className="tool-icon">⬆️</div>
              <div className="tool-content tool-content-inline">
                <div className="tool-name">Нормаль</div>
                <button className={`tool-action ${showNormal ? 'active' : ''}`} onClick={handleShowNormal}>{showNormal ? 'Скрыть' : 'Показать'}</button>
              </div>
            </div>

            <div className="tool-item">
              <div className="tool-icon">📐</div>
              <div className="tool-content tool-content-inline">
                <div className="tool-name">Касательная</div>
                <button className={`tool-action ${showTangentPlane ? 'active' : ''}`} onClick={handleShowTangentPlane}>{showTangentPlane ? 'Скрыть' : 'Показать'}</button>
              </div>
            </div>

            <div className="tool-item">
              <div className="tool-icon">📊</div>
              <div className="tool-content tool-content-inline">
                <div className="tool-name">Кривизна</div>
                <button className={`tool-action ${showCurvature ? 'active' : ''}`} onClick={handleShowCurvature}>{showCurvature ? 'Скрыть' : 'Показать'}</button>
              </div>
            </div>

            <div className="tool-item">
              <div className="tool-icon">🔗</div>
              <div className="tool-content tool-content-inline">
                <div className="tool-name">Пересечения</div>
                <button className={`tool-action ${showIntersections ? 'active' : ''}`} onClick={() => setShowIntersections(!showIntersections)}>{showIntersections ? 'Скрыть' : 'Показать'}</button>
              </div>
            </div>
          </div>

          <div className="tool-summary tool-summary-full">
            <strong>{resolvedSystemSummary.title}</strong><br />
            {resolvedSystemSummary.formula}<br />
            {resolvedSystemSummary.radius !== null ? `Радиус: ${resolvedSystemSummary.radius.toFixed(3)}. ` : ''}
            {resolvedSystemSummary.detail}
          </div>
        </div>

        <div className="examples-card">
          <div className="card-title">📚 Быстрые примеры</div>
          <div className="examples-grid">
            {examples.map((ex) => (
              <button key={ex.name} className="example-chip" onClick={() => loadExample(ex.eq)} title={ex.desc}>{ex.name}</button>
            ))}
          </div>
        </div>

        <div className="stats-card">
          <div className="card-title">📊 Статистика</div>
          <div className="stats-grid">
            <div className="stat-item"><span>Поверхностей</span><span className="stat-value">{surfaces.length}</span></div>
            <div className="stat-item"><span>Всего вершин</span><span className="stat-value">{totalVertices.toLocaleString()}</span></div>
            <div className="stat-item"><span>Всего треугольников</span><span className="stat-value">{Math.floor(totalVertices / 3).toLocaleString()}</span></div>
            <div className="stat-item"><span>FPS</span><span className="stat-value" style={{ color: fps > 50 ? '#4ECDC4' : fps > 30 ? '#FFE66D' : '#FF6B6B' }}>{fps}</span></div>
          </div>
        </div>

        {showIntersections && surfaces.length >= 2 && intersectionPoints.length > 0 && (
          <IntersectionPoints
            points={intersectionPoints}
            onPointClick={(point) => {
              setSelectedPoint({ ...point.point, surfaceId: point.surfaceIds[0] });
              setAnalysisResult(`🔗 Точка пересечения: (${point.point.x.toFixed(3)}, ${point.point.y.toFixed(3)}, ${point.point.z.toFixed(3)})`);
            }}
          />
        )}
      </div>
    </div>
  );
}
