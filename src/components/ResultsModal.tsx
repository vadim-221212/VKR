import type { CurvatureData, EquationAnalysisResponse, SectionData, SystemAnalysisResponse, SurfaceType } from '../types/surface';

type ActiveTab = 'point' | 'curvature' | 'section' | 'solver' | 'systems' | 'theory';

interface Section2DAnalysis {
  svgPolyline: string;
  svgPolylines?: string[];
  width: number;
  height: number;
  area: number;
  perimeter: number;
  diameter: number;
  viewBoxSize: number;
}

interface AxisProjectionView {
  label: 'XY' | 'XZ' | 'YZ';
  analysis: Section2DAnalysis;
  displayShape: 'circle' | 'polyline';
}

interface ResolvedSystemSummary {
  title: string;
  formula: string;
  detail: string;
  radius: number | null;
}

interface ClassificationData {
  label: string;
  order: string;
  note: string;
  specialPoints: number[][];
  ruledSegments: number[][][];
}

interface TheoryEntry {
  title: string;
  content: string;
}

interface ResultsModalProps {
  showResults: boolean;
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  onClose: () => void;
  selectedSurfaceEquation: string | null;
  selectedPoint: { x: number; y: number; z: number; surfaceId: string } | null;
  normalPoint: { x: number; y: number; z: number } | null;
  curvatureData: CurvatureData | null;
  sectionCurve: SectionData | null;
  sectionEquation: string;
  current2DAnalysis: Section2DAnalysis | null;
  sectionAxisViews: AxisProjectionView[];
  dynamicSectionSummary: {
    type: string;
    equation: string;
    detail: string;
    radius: number | null;
  } | null;
  equationAnalysis: EquationAnalysisResponse | null;
  resolvedSystemSummary: ResolvedSystemSummary;
  systemAnalysis: SystemAnalysisResponse | null;
  systemExplanation: string;
  intersection2DComponents: Array<{
    label: string;
    planeLabel: string;
    analysis: Section2DAnalysis;
    displayShape: 'circle' | 'polyline';
    axisViews: AxisProjectionView[];
  }>;
  theoryContent: Record<string, TheoryEntry>;
  detectedType: SurfaceType;
  classificationData: ClassificationData;
}

export function ResultsModal({
  showResults,
  activeTab,
  onChangeTab,
  onClose,
  selectedSurfaceEquation,
  selectedPoint,
  normalPoint,
  curvatureData,
  sectionCurve,
  sectionEquation,
  current2DAnalysis,
  sectionAxisViews,
  dynamicSectionSummary,
  equationAnalysis,
  resolvedSystemSummary,
  systemAnalysis,
  systemExplanation,
  intersection2DComponents,
  theoryContent,
  detectedType,
  classificationData,
}: ResultsModalProps) {
  if (!showResults) return null;
  const displaySectionAsCircle = dynamicSectionSummary?.type.toLowerCase().includes('окруж');

  const renderPlot = (analysis: Section2DAnalysis, displayShape: 'circle' | 'polyline', forceCircle = false) => (
    <svg className="section-2d-plot" viewBox={`0 0 ${analysis.viewBoxSize} ${analysis.viewBoxSize}`}>
      <rect x="0" y="0" width={analysis.viewBoxSize} height={analysis.viewBoxSize} fill="transparent" />
      <line x1="0" y1={analysis.viewBoxSize / 2} x2={analysis.viewBoxSize} y2={analysis.viewBoxSize / 2} className="section-axis" />
      <line x1={analysis.viewBoxSize / 2} y1="0" x2={analysis.viewBoxSize / 2} y2={analysis.viewBoxSize} className="section-axis" />
      {(forceCircle || displayShape === 'circle') ? (
        <circle
          cx={analysis.viewBoxSize / 2}
          cy={analysis.viewBoxSize / 2}
          r={Math.max(12, Math.min(analysis.viewBoxSize * 0.34, analysis.viewBoxSize / 2 - 22))}
          className="section-circle"
        />
      ) : (
        (analysis.svgPolylines?.length ? analysis.svgPolylines : [analysis.svgPolyline]).map((polyline, index) => (
          <polyline key={index} points={polyline} className="section-polyline" />
        ))
      )}
    </svg>
  );

  return (
    <div className="results-modal-backdrop" onClick={onClose}>
      <div className="results-modal" onClick={(event) => event.stopPropagation()}>
        <div className="results-header">
          <div className="results-tabs">
            <button className={`tab ${activeTab === 'point' ? 'active' : ''}`} onClick={() => onChangeTab('point')}>Точка</button>
            <button className={`tab ${activeTab === 'curvature' ? 'active' : ''}`} onClick={() => onChangeTab('curvature')}>Кривизна</button>
            <button className={`tab ${activeTab === 'section' ? 'active' : ''}`} onClick={() => onChangeTab('section')}>Сечение</button>
            <button className={`tab ${activeTab === 'solver' ? 'active' : ''}`} onClick={() => onChangeTab('solver')}>Решатель</button>
            <button className={`tab ${activeTab === 'systems' ? 'active' : ''}`} onClick={() => onChangeTab('systems')}>Системы</button>
            <button className={`tab ${activeTab === 'theory' ? 'active' : ''}`} onClick={() => onChangeTab('theory')}>Теория</button>
          </div>
          <button className="close-panel" onClick={onClose}>✕</button>
        </div>

        <div className="results-content">
          {activeTab === 'point' && (
            <>
              <div className="result-group">
                <div className="result-label">📍 Выбранная точка</div>
                {selectedPoint ? (
                  <div className="result-coords">
                    x = {selectedPoint.x.toFixed(4)}<br />
                    y = {selectedPoint.y.toFixed(4)}<br />
                    z = {selectedPoint.z.toFixed(4)}
                  </div>
                ) : (
                  <div className="result-placeholder">Кликните на поверхность, чтобы выбрать точку</div>
                )}
              </div>
              <div className="result-group">
                <div className="result-label">⬆️ Вектор нормали</div>
                {normalPoint ? (
                  <div className="result-coords">
                    n = ({normalPoint.x.toFixed(3)}, {normalPoint.y.toFixed(3)}, {normalPoint.z.toFixed(3)})<br />
                    |n| = {Math.sqrt(normalPoint.x ** 2 + normalPoint.y ** 2 + normalPoint.z ** 2).toFixed(3)}
                  </div>
                ) : (
                  <div className="result-placeholder">Выберите точку для отображения нормали</div>
                )}
              </div>
            </>
          )}

          {activeTab === 'curvature' && (
            <>
              <div className="result-group">
                <div className="result-label">Ⅰ Первая квадратичная форма</div>
                {curvatureData ? (
                  <div className="result-coords">
                    E = {curvatureData.E.toFixed(4)}<br />
                    F = {curvatureData.F.toFixed(4)}<br />
                    G = {curvatureData.G.toFixed(4)}
                  </div>
                ) : (
                  <div className="result-placeholder">Выберите точку на поверхности для вычисления E, F, G.</div>
                )}
              </div>
              <div className="result-group">
                <div className="result-label">Ⅱ Вторая квадратичная форма</div>
                {curvatureData ? (
                  <div className="result-coords">
                    L = {curvatureData.L.toFixed(4)}<br />
                    M = {curvatureData.M.toFixed(4)}<br />
                    N = {curvatureData.N.toFixed(4)}
                  </div>
                ) : (
                  <div className="result-placeholder">После выбора точки система вычислит L, M, N.</div>
                )}
              </div>
              <div className="result-group">
                <div className="result-label">📐 Гауссова кривизна (K)</div>
                <div className="result-value-large">{curvatureData ? curvatureData.gaussian.toFixed(4) : '—'}</div>
              </div>
              <div className="result-group">
                <div className="result-label">📊 Средняя кривизна (H)</div>
                <div className="result-value-large">{curvatureData ? curvatureData.mean.toFixed(4) : '—'}</div>
              </div>
              <div className="result-group">
                <div className="result-label">🔬 Тип точки</div>
                <div className="result-type">{curvatureData ? curvatureData.pointTypeRu : '—'}</div>
              </div>
              <div className="result-group">
                <div className="result-label">k₁ и k₂</div>
                {curvatureData ? (
                  <div className="result-coords">
                    k₁ = {curvatureData.principal1.toFixed(4)}<br />
                    k₂ = {curvatureData.principal2.toFixed(4)}
                  </div>
                ) : (
                  <div className="result-placeholder">Главные кривизны появятся после выбора точки.</div>
                )}
              </div>
              <div className="result-note">
                <strong>ℹ️ О кривизне:</strong><br />
                K {'>'} 0 — эллиптическая точка<br />
                K {'<'} 0 — гиперболическая точка<br />
                K = 0 — параболическая или плоская точка
              </div>
            </>
          )}

          {activeTab === 'section' && (
            <>
              <div className="result-group">
                <div className="result-label">🧮 Распознанное уравнение сечения</div>
                {dynamicSectionSummary ? (
                  <div className="result-coords">
                    Тип: {dynamicSectionSummary.type}<br />
                    Уравнение: {dynamicSectionSummary.equation}<br />
                    {dynamicSectionSummary.radius !== null
                      ? `Радиус: ${dynamicSectionSummary.radius.toFixed(3)}`
                      : dynamicSectionSummary.detail}
                  </div>
                ) : (
                  <div className="result-placeholder">Постройте сечение, чтобы система вывела формулу и тип кривой.</div>
                )}
              </div>
              <div className="result-group">
                <div className="result-label">✂️ Параметры сечения</div>
                <div className="result-coords">Плоскость: {sectionCurve?.planeEquation || sectionEquation}</div>
              </div>
              <div className="result-group">
                <div className="result-label">📈 Тип кривой сечения</div>
                <div className="result-type">{sectionCurve ? sectionCurve.curveTypeRu : '—'}</div>
              </div>
              <div className="result-group">
                <div className="result-label">🎯 Наглядные метки</div>
                {sectionCurve ? (
                  <div className="result-text">
                    Найдено {sectionCurve.points.length} опорных точек и {sectionCurve.segments.length} линейных фрагментов.
                    На сцене сечение показывается в первую очередь как связная линия, чтобы форма читалась ровнее и чище.
                  </div>
                ) : (
                  <div className="result-placeholder">Постройте сечение, чтобы увидеть линию пересечения поверхности с плоскостью.</div>
                )}
              </div>
              <div className="result-group">
                <div className="result-label">🧭 2D-представление</div>
                {current2DAnalysis ? (
                  <div className="section-2d-card">
                    {renderPlot(current2DAnalysis, 'polyline', displaySectionAsCircle)}
                    <div className="section-metrics">
                      <div>Ширина: {current2DAnalysis.width.toFixed(3)}</div>
                      <div>Высота: {current2DAnalysis.height.toFixed(3)}</div>
                      <div>Периметр: {current2DAnalysis.perimeter.toFixed(3)}</div>
                      <div>Площадь: {current2DAnalysis.area.toFixed(3)}</div>
                      <div>Диаметр: {current2DAnalysis.diameter.toFixed(3)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="result-placeholder">После построения сечения или линии уровня здесь появится 2D-вид и базовые размеры фигуры.</div>
                )}
              </div>
              {sectionAxisViews.length ? (
                <div className="result-group">
                  <div className="result-label">🪟 Проекции на XY / XZ / YZ</div>
                  <div className="system-2d-grid">
                    {sectionAxisViews.map((view) => (
                      <div key={`section-axis-${view.label}`} className="section-2d-card">
                        <div className="system-2d-header">
                          <strong>{view.label}</strong>
                          <span>Проекция</span>
                        </div>
                        {renderPlot(view.analysis, view.displayShape)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {intersection2DComponents.length ? (
                <div className="result-group">
                  <div className="result-label">🔗 Пересечение поверхностей</div>
                  <div className="result-text">{resolvedSystemSummary.formula}</div>
                  <div className="system-2d-grid" style={{ marginTop: '14px' }}>
                    {intersection2DComponents.map((component) => (
                      <div key={`section-${component.label}-${component.planeLabel}`} className="section-2d-card">
                        <div className="system-2d-header">
                          <strong>{component.label}</strong>
                          <span>{component.planeLabel}</span>
                        </div>
                        {renderPlot(component.analysis, component.displayShape)}
                        {component.axisViews.length ? (
                          <div className="system-2d-grid" style={{ marginTop: '12px' }}>
                            {component.axisViews.map((view) => (
                              <div key={`${component.label}-${view.label}`} className="section-2d-card">
                                <div className="system-2d-header">
                                  <strong>{view.label}</strong>
                                  <span>Проекция</span>
                                </div>
                                {renderPlot(view.analysis, view.displayShape)}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {activeTab === 'solver' && (
            <>
              <div className="result-group">
                <div className="result-label">🧠 Анализ выбранной поверхности</div>
                <div className="result-text">{selectedSurfaceEquation || 'Сначала выберите поверхность слева.'}</div>
              </div>
              <div className="result-group">
                <div className="result-label">Решение / пересечение с XOY</div>
                <div className="result-text">
                  {equationAnalysis ? equationAnalysis.zero_level : 'Запустите анализ, чтобы получить корни при z = 0 и пересечения с координатными плоскостями.'}
                </div>
              </div>
              <div className="result-group">
                <div className="result-label">Плоскости XOY / XOZ / YOZ</div>
                {equationAnalysis ? (
                  <div className="result-coords">
                    XOY: {equationAnalysis.xoy_intersection}<br />
                    XOZ: {equationAnalysis.xoz_intersection}<br />
                    YOZ: {equationAnalysis.yoz_intersection}
                  </div>
                ) : (
                  <div className="result-placeholder">Нет данных решателя.</div>
                )}
              </div>
              <div className="result-group">
                <div className="result-label">Экстремумы и седловые точки</div>
                {equationAnalysis && equationAnalysis.critical_points.length > 0 ? (
                  <div className="result-coords">
                    {equationAnalysis.critical_points.map((point, index) => (
                      <div key={index}>({point.x.toFixed(3)}, {point.y.toFixed(3)}, {point.z.toFixed(3)}) — {point.point_type_ru}</div>
                    ))}
                  </div>
                ) : (
                  <div className="result-text">{equationAnalysis?.extrema_summary || 'Сначала выполните анализ выбранной поверхности.'}</div>
                )}
              </div>
              <div className="result-note">
                <strong>Важно:</strong><br />
                Вкладка «Решатель» анализирует саму поверхность и стандартные координатные плоскости XOY, XOZ, YOZ. Если вам нужно увидеть сечение вида `x = 1`, `y = 2` или `x + y + z = 0`, используйте блок «Метод сечений».
              </div>
            </>
          )}

          {activeTab === 'systems' && (
            <>
              <div className="result-group">
                <div className="result-label">🔗 Система уравнений</div>
                <div className="result-text">{resolvedSystemSummary.title}</div>
                <div className="result-coords" style={{ marginTop: '10px' }}>{resolvedSystemSummary.formula}</div>
              </div>
              <div className="result-group">
                <div className="result-label">Линия пересечения</div>
                <div className="result-text">{resolvedSystemSummary.detail}</div>
                {resolvedSystemSummary.radius !== null && (
                  <div className="result-type" style={{ marginTop: '10px' }}>
                    Радиус: {resolvedSystemSummary.radius.toFixed(3)}
                  </div>
                )}
              </div>
              {systemAnalysis?.solutions?.length ? (
                <div className="result-group">
                  <div className="result-label">Шаги решения</div>
                  <div className="result-text">
                    {systemAnalysis.solutions.map((solution, index) => (
                      <div key={index}>{index + 1}. {solution}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {intersection2DComponents.length ? (
                <div className="result-group">
                  <div className="result-label">🧭 2D-визуализация пересечения</div>
                  <div className="system-2d-grid">
                    {intersection2DComponents.map((component) => (
                      <div key={`${component.label}-${component.planeLabel}`} className="section-2d-card">
                        <div className="system-2d-header">
                          <strong>{component.label}</strong>
                          <span>{component.planeLabel}</span>
                        </div>
                        <svg className="section-2d-plot" viewBox={`0 0 ${component.analysis.viewBoxSize} ${component.analysis.viewBoxSize}`}>
                          <rect x="0" y="0" width={component.analysis.viewBoxSize} height={component.analysis.viewBoxSize} fill="transparent" />
                          <line x1="0" y1={component.analysis.viewBoxSize / 2} x2={component.analysis.viewBoxSize} y2={component.analysis.viewBoxSize / 2} className="section-axis" />
                          <line x1={component.analysis.viewBoxSize / 2} y1="0" x2={component.analysis.viewBoxSize / 2} y2={component.analysis.viewBoxSize} className="section-axis" />
                          {component.displayShape === 'circle' ? (
                            <circle
                              cx={component.analysis.viewBoxSize / 2}
                              cy={component.analysis.viewBoxSize / 2}
                              r={Math.max(12, Math.min(component.analysis.viewBoxSize * 0.34, component.analysis.viewBoxSize / 2 - 22))}
                              className="section-circle"
                            />
                          ) : (
                            (component.analysis.svgPolylines?.length ? component.analysis.svgPolylines : [component.analysis.svgPolyline]).map((polyline, index) => (
                              <polyline key={index} points={polyline} className="section-polyline" />
                            ))
                          )}
                        </svg>
                        <div className="section-metrics">
                          <div>Ширина: {component.analysis.width.toFixed(3)}</div>
                          <div>Высота: {component.analysis.height.toFixed(3)}</div>
                          <div>Периметр: {component.analysis.perimeter.toFixed(3)}</div>
                          <div>Площадь: {component.analysis.area.toFixed(3)}</div>
                          <div>Диаметр: {component.analysis.diameter.toFixed(3)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="result-note">
                <strong>Почему получилась именно эта кривая:</strong><br />
                {systemExplanation}
              </div>
            </>
          )}

          {activeTab === 'theory' && (
            <>
              <div className="result-group">
                <div className="result-label">📖 {theoryContent[detectedType]?.title || 'Теория поверхностей'}</div>
                <div className="result-text">
                  {theoryContent[detectedType]?.content || 'Поверхность — двумерное многообразие в трёхмерном пространстве.'}
                </div>
              </div>
              <div className="result-group">
                <div className="result-label">🔬 Классификация</div>
                <div className="result-text">
                  Тип: {classificationData.label}<br />
                  Порядок поверхности: {classificationData.order}<br />
                  {classificationData.note}
                </div>
              </div>
              <div className="result-group">
                <div className="result-label">🟠 Особые точки и образующие</div>
                <div className="result-text">
                  Особых точек найдено: {classificationData.specialPoints.length}<br />
                  Прямолинейных образующих показано: {classificationData.ruledSegments.length}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
