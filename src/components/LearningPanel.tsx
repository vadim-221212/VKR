// src/components/LearningPanel.tsx
import React from 'react';
import type { CurvatureData, LearningMaterial, SectionData, SurfaceType } from '../types/surface';

interface LearningPanelProps {
  surfaceType: SurfaceType;
  curvatureData?: CurvatureData;
  sectionData?: SectionData;
  selectedPoint?: { x: number; y: number; z: number };
  normalPoint?: { x: number; y: number; z: number };
}

const materials: Record<string, LearningMaterial> = {
  explicit: {
    title: '📖 Явное задание поверхности',
    content: 'Поверхность задаётся уравнением вида z = f(x, y), где f — непрерывная функция двух переменных. Каждая точка (x, y) из области определения задаёт точку поверхности (x, y, f(x, y)).',
    formula: 'z = f(x, y)',
    example: 'z = x² + y² — эллиптический параболоид'
  },
  implicit: {
    title: '📖 Неявное задание поверхности',
    content: 'Поверхность задаётся уравнением F(x, y, z) = 0, где F — непрерывно дифференцируемая функция. Множество всех точек, удовлетворяющих уравнению, образует поверхность.',
    formula: 'F(x, y, z) = 0',
    example: 'x² + y² + z² = R² — сфера радиуса R'
  },
  parametric: {
    title: '📖 Параметрическое задание поверхности',
    content: 'Поверхность задаётся векторной функцией r(u, v) = (x(u, v), y(u, v), z(u, v)), где u, v — параметры. Это наиболее гибкий способ описания поверхностей.',
    formula: 'r(u, v) = (x(u, v), y(u, v), z(u, v))',
    example: 'x = R·sin(u)·cos(v), y = R·sin(u)·sin(v), z = R·cos(u) — сфера'
  },
  normal: {
    title: '⬆️ Вектор нормали',
    content: 'Вектор нормали в точке поверхности — это вектор, перпендикулярный касательной плоскости. Он показывает направление "наружу" от поверхности.',
    formula: 'Для явной функции: n = (-∂f/∂x, -∂f/∂y, 1)',
    example: 'В точке (0,0) для z = x² + y² нормаль направлена вертикально вверх'
  },
  tangent: {
    title: '📐 Касательная плоскость',
    content: 'Касательная плоскость — это плоскость, которая наилучшим образом аппроксимирует поверхность в заданной точке. Она содержит все касательные векторы.',
    formula: 'z - z₀ = f_x(x₀,y₀)(x-x₀) + f_y(x₀,y₀)(y-y₀)',
    example: 'Для сферы касательная плоскость в точке перпендикулярна радиусу'
  },
  curvature: {
    title: '📊 Кривизна поверхности',
    content: 'Гауссова кривизна K — произведение главных кривизн. Определяет локальную форму поверхности: K > 0 — эллиптическая (выпуклая), K < 0 — гиперболическая (седло), K = 0 — параболическая (цилиндр, плоскость).',
    formula: 'K = k₁·k₂, H = (k₁ + k₂)/2',
    example: 'Сфера: K = 1/R² > 0, Седло: K < 0'
  },
  section: {
    title: '✂️ Метод сечений',
    content: 'Метод исследования формы поверхности путём пересечения её плоскостями. Позволяет определить тип поверхности по форме линий сечения.',
    formula: 'Сечение плоскостью z = const даёт кривую f(x, y) = const',
    example: 'Эллипсоид даёт эллипсы, гиперболоид — гиперболы'
  }
};

export function LearningPanel({ surfaceType, curvatureData, sectionData, selectedPoint, normalPoint }: LearningPanelProps) {
  const [activeLesson, setActiveLesson] = React.useState<string>(surfaceType);

  const lessons = [
    { id: surfaceType, icon: '📐', label: 'Тип поверхности' },
    { id: 'normal', icon: '⬆️', label: 'Вектор нормали' },
    { id: 'tangent', icon: '📐', label: 'Касательная плоскость' },
    { id: 'curvature', icon: '📊', label: 'Кривизна' },
    { id: 'section', icon: '✂️', label: 'Метод сечений' },
  ];

  const currentMaterial = materials[activeLesson] || materials[surfaceType];

  return (
    <div className="learning-panel">
      <div className="learning-header">
        <span className="learning-title">🎓 Обучение</span>
        <span className="learning-subtitle">Теория и практика</span>
      </div>

      <div className="learning-lessons">
        {lessons.map(lesson => (
          <button
            key={lesson.id}
            className={`lesson-btn ${activeLesson === lesson.id ? 'active' : ''}`}
            onClick={() => setActiveLesson(lesson.id)}
          >
            <span className="lesson-icon">{lesson.icon}</span>
            <span className="lesson-label">{lesson.label}</span>
          </button>
        ))}
      </div>

      <div className="learning-content">
        <div className="learning-material">
          <h4>{currentMaterial.title}</h4>
          <p>{currentMaterial.content}</p>
          {currentMaterial.formula && (
            <div className="learning-formula">
              <code>{currentMaterial.formula}</code>
            </div>
          )}
          {currentMaterial.example && (
            <div className="learning-example">
              <strong>Пример:</strong> {currentMaterial.example}
            </div>
          )}
        </div>

        {/* Практический блок с текущими данными */}
        <div className="learning-practical">
          <div className="practical-title">📌 Текущие данные</div>
          
          {selectedPoint && (
            <div className="practical-item">
              <span className="practical-label">Выбранная точка:</span>
              <span className="practical-value">
                ({selectedPoint.x.toFixed(3)}, {selectedPoint.y.toFixed(3)}, {selectedPoint.z.toFixed(3)})
              </span>
            </div>
          )}

          {normalPoint && (
            <div className="practical-item">
              <span className="practical-label">Вектор нормали:</span>
              <span className="practical-value">
                ({normalPoint.x.toFixed(3)}, {normalPoint.y.toFixed(3)}, {normalPoint.z.toFixed(3)})
              </span>
            </div>
          )}

          {curvatureData && (
            <>
              <div className="practical-item">
                <span className="practical-label">E, F, G:</span>
                <span className="practical-value">
                  {curvatureData.E.toFixed(2)}, {curvatureData.F.toFixed(2)}, {curvatureData.G.toFixed(2)}
                </span>
              </div>
              <div className="practical-item">
                <span className="practical-label">L, M, N:</span>
                <span className="practical-value">
                  {curvatureData.L.toFixed(2)}, {curvatureData.M.toFixed(2)}, {curvatureData.N.toFixed(2)}
                </span>
              </div>
              <div className="practical-item">
                <span className="practical-label">Гауссова кривизна K:</span>
                <span className={`practical-value ${curvatureData.gaussian > 0 ? 'positive' : curvatureData.gaussian < 0 ? 'negative' : 'zero'}`}>
                  {curvatureData.gaussian.toFixed(4)}
                </span>
              </div>
              <div className="practical-item">
                <span className="practical-label">Средняя кривизна H:</span>
                <span className="practical-value">{curvatureData.mean.toFixed(4)}</span>
              </div>
              <div className="practical-item">
                <span className="practical-label">k₁, k₂:</span>
                <span className="practical-value">
                  {curvatureData.principal1.toFixed(3)}, {curvatureData.principal2.toFixed(3)}
                </span>
              </div>
              <div className="practical-item">
                <span className="practical-label">Тип точки:</span>
                <span className="practical-value">{curvatureData.pointTypeRu}</span>
              </div>
            </>
          )}

          {sectionData && (
            <div className="practical-item">
              <span className="practical-label">Тип сечения:</span>
              <span className="practical-value">{sectionData.curveTypeRu}</span>
            </div>
          )}
        </div>

        {/* Интерактивная подсказка */}
        <div className="learning-tip">
          <span className="tip-icon">💡</span>
          <span className="tip-text">
            {activeLesson === 'normal' && 'Нажмите на поверхность, чтобы увидеть вектор нормали в выбранной точке!'}
            {activeLesson === 'tangent' && 'Включите касательную плоскость, чтобы увидеть локальную аппроксимацию!'}
            {activeLesson === 'curvature' && 'Гауссова кривизна показывает, насколько поверхность отличается от плоскости!'}
            {activeLesson === 'section' && 'Постройте сечение, чтобы увидеть форму линии пересечения!'}
            {activeLesson === surfaceType && 'Попробуйте разные уравнения из списка примеров!'}
          </span>
        </div>
      </div>
    </div>
  );
}
