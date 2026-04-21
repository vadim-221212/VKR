# -*- coding: utf-8 -*-
"""
API маршруты для визуализации и анализа поверхностей
Поддерживает явные, неявные и параметрические поверхности
"""

from fastapi import APIRouter, HTTPException
import time
import numpy as np
import re
from typing import Dict, Any
from sympy import symbols, sympify, diff, solve, Eq, simplify, N, Poly, nsolve
from sympy.core.sympify import SympifyError

from app.models.schemas import (
    SurfaceRequest, SurfaceResponse,
    NormalRequest, NormalResponse,
    CurvatureRequest, CurvatureResponse,
    EquationAnalysisRequest, EquationAnalysisResponse, CriticalPointResponse,
    SystemAnalysisRequest, SystemAnalysisResponse,
)
from app.core.parser import ExpressionParser
from app.core.generator import SurfaceGenerator
from app.core.normals import NormalCalculator
from app.core.marching_cubes import MarchingCubes
from app.core.curvature import CurvatureCalculator

router = APIRouter()
parser = ExpressionParser()
generator = SurfaceGenerator()
normal_calc = NormalCalculator()
curvature_calc = CurvatureCalculator()
x_sym, y_sym, z_sym = symbols('x y z')
u_sym, v_sym = symbols('u v')


def _format_expr(expr) -> str:
    return str(simplify(expr)).replace('**', '^')


def _classify_critical_point(fxx, fxy, fyy) -> tuple[str, str]:
    det = fxx * fyy - fxy * fxy
    if det > 1e-8 and fxx > 0:
        return "minimum", "Локальный минимум"
    if det > 1e-8 and fxx < 0:
        return "maximum", "Локальный максимум"
    if det < -1e-8:
        return "saddle", "Седловая точка"
    return "degenerate", "Вырожденная критическая точка"


def _is_real_value(value) -> bool:
    return getattr(value, "is_real", True) not in [False]


def _safe_float(value) -> float:
    return float(N(value))


def _quadratic_curve_type(expr, vars_pair) -> tuple[str, float | None]:
    try:
        poly = Poly(simplify(expr), *vars_pair)
    except Exception:
        return "не удалось определить", None

    if poly.total_degree() <= 0:
        return "вырожденный случай", None
    if poly.total_degree() == 1:
        return "прямая", None
    if poly.total_degree() > 2:
        return "кривая более высокого порядка", None

    a = poly.coeff_monomial(vars_pair[0] ** 2)
    b = poly.coeff_monomial(vars_pair[0] * vars_pair[1])
    c = poly.coeff_monomial(vars_pair[1] ** 2)
    discriminant = simplify(b ** 2 - 4 * a * c)

    if simplify(a - c) == 0 and simplify(b) == 0:
        const_term = poly.coeff_monomial(1)
        if simplify(a) != 0 and _is_real_value(-const_term / a):
            radius_sq = simplify(-const_term / a)
            if radius_sq.is_number and _safe_float(radius_sq) >= 0:
                return "окружность", _safe_float(radius_sq) ** 0.5

    try:
        disc_value = _safe_float(discriminant)
    except Exception:
        return "квадратичная кривая", None

    if abs(disc_value) < 1e-8:
        return "парабола", None
    if disc_value > 0:
        return "гипербола", None
    return "эллипс", None


def _detect_standard_quadric(expr) -> tuple[str, float | None]:
    try:
        poly = Poly(simplify(expr), x_sym, y_sym, z_sym)
    except Exception:
        return "general", None

    if poly.total_degree() != 2:
        return "general", None

    cross_terms = [
        poly.coeff_monomial(x_sym * y_sym),
        poly.coeff_monomial(x_sym * z_sym),
        poly.coeff_monomial(y_sym * z_sym),
        poly.coeff_monomial(x_sym),
        poly.coeff_monomial(y_sym),
        poly.coeff_monomial(z_sym),
    ]
    if any(simplify(term) != 0 for term in cross_terms):
        return "general", None

    ax = simplify(poly.coeff_monomial(x_sym ** 2))
    ay = simplify(poly.coeff_monomial(y_sym ** 2))
    az = simplify(poly.coeff_monomial(z_sym ** 2))
    const = simplify(poly.coeff_monomial(1))

    if ax == 1 and ay == 1 and az == 1 and const.is_number:
        radius_sq = simplify(-const)
        if radius_sq.is_number and _safe_float(radius_sq) >= 0:
            return "sphere", _safe_float(radius_sq)

    if ax == 1 and ay == 1 and az == 0 and const.is_number:
        radius_sq = simplify(-const)
        if radius_sq.is_number and _safe_float(radius_sq) >= 0:
            return "cylinder_z", _safe_float(radius_sq)

    if ax == 1 and ay == 1 and az == -1 and simplify(const) == 0:
        return "cone_z", None

    return "general", None


def _deduplicate_points(points: list[CriticalPointResponse], eps: float = 1e-5) -> list[CriticalPointResponse]:
    unique: dict[tuple[int, int], CriticalPointResponse] = {}
    for point in points:
        key = (round(point.x / eps), round(point.y / eps))
        unique[key] = point
    return list(unique.values())


def _find_explicit_critical_points(expr) -> list[CriticalPointResponse]:
    fx = diff(expr, x_sym)
    fy = diff(expr, y_sym)
    fxx = diff(fx, x_sym)
    fxy = diff(fx, y_sym)
    fyy = diff(fy, y_sym)
    points: list[CriticalPointResponse] = []

    try:
        symbolic_solutions = solve((Eq(fx, 0), Eq(fy, 0)), (x_sym, y_sym), dict=True)
    except Exception:
        symbolic_solutions = []

    for solution in symbolic_solutions[:16]:
        x_val = solution.get(x_sym)
        y_val = solution.get(y_sym)
        if x_val is None or y_val is None or not (_is_real_value(x_val) and _is_real_value(y_val)):
            continue
        x_num = _safe_float(x_val)
        y_num = _safe_float(y_val)
        z_num = _safe_float(expr.subs({x_sym: x_val, y_sym: y_val}))
        point_type, point_type_ru = _classify_critical_point(
            _safe_float(fxx.subs({x_sym: x_val, y_sym: y_val})),
            _safe_float(fxy.subs({x_sym: x_val, y_sym: y_val})),
            _safe_float(fyy.subs({x_sym: x_val, y_sym: y_val})),
        )
        points.append(CriticalPointResponse(
            x=x_num,
            y=y_num,
            z=z_num,
            point_type=point_type,
            point_type_ru=point_type_ru,
        ))

    if points:
        return _deduplicate_points(points)

    seeds = [-3, -2, -1, 0, 1, 2, 3]
    for sx in seeds:
        for sy in seeds:
            try:
                solution = nsolve((fx, fy), (x_sym, y_sym), (sx, sy), tol=1e-12, maxsteps=100)
            except Exception:
                continue
            x_val = _safe_float(solution[0])
            y_val = _safe_float(solution[1])
            z_val = _safe_float(expr.subs({x_sym: x_val, y_sym: y_val}))
            point_type, point_type_ru = _classify_critical_point(
                _safe_float(fxx.subs({x_sym: x_val, y_sym: y_val})),
                _safe_float(fxy.subs({x_sym: x_val, y_sym: y_val})),
                _safe_float(fyy.subs({x_sym: x_val, y_sym: y_val})),
            )
            points.append(CriticalPointResponse(
                x=x_val,
                y=y_val,
                z=z_val,
                point_type=point_type,
                point_type_ru=point_type_ru,
            ))

    return _deduplicate_points(points)


def _surface_expr(surface) -> tuple[str, Any]:
    if surface.surface_type == "explicit":
        expr = sympify(preprocess_equation(surface.equation, "explicit"))
        return "explicit", expr
    if surface.surface_type == "implicit":
        expr = sympify(preprocess_equation(surface.equation, "implicit"))
        return "implicit", expr
    if surface.surface_type == "parametric":
        return "parametric", None
    raise ValueError("Неизвестный тип поверхности для анализа системы")


def _analyze_system(surface_a, surface_b) -> dict:
    kind_a, expr_a = _surface_expr(surface_a)
    kind_b, expr_b = _surface_expr(surface_b)

    if kind_a == "parametric" or kind_b == "parametric":
        return {
            "title": "Пересечение поверхности с параметрическим заданием",
            "formula": "Для этой пары используется численная линия пересечения на сцене",
            "detail": (
                "Символьный анализ для параметрических поверхностей ограничен, "
                "поэтому 2D- и 3D-представление строятся по численно найденным сегментам пересечения."
            ),
            "curve_type": "численное пересечение",
            "radius": None,
            "solutions": [
                "Параметрическая поверхность анализируется численно.",
                "Используйте линию пересечения на сцене и 2D-проекцию по найденным сегментам.",
            ],
        }

    if kind_a == "explicit" and kind_b == "explicit":
        reduced = simplify(expr_a - expr_b)
        curve_type, radius = _quadratic_curve_type(reduced, (x_sym, y_sym))
        return {
            "title": "Пересечение двух явных поверхностей",
            "formula": f"{_format_expr(expr_a)} = {_format_expr(expr_b)}",
            "detail": f"После приравнивания получаем: {_format_expr(reduced)} = 0.",
            "curve_type": curve_type,
            "radius": radius,
            "solutions": [f"{_format_expr(reduced)} = 0"],
        }

    if kind_a == "implicit" and kind_b == "explicit":
        reduced = simplify(expr_a.subs(z_sym, expr_b))
        curve_type, radius = _quadratic_curve_type(reduced, (x_sym, y_sym))
        return {
            "title": "Пересечение неявной и явной поверхности",
            "formula": f"{_format_expr(reduced)} = 0, z = {_format_expr(expr_b)}",
            "detail": "Выполнена подстановка z из явной поверхности в неявное уравнение.",
            "curve_type": curve_type,
            "radius": radius,
            "solutions": [f"{_format_expr(reduced)} = 0", f"z = {_format_expr(expr_b)}"],
        }

    if kind_a == "explicit" and kind_b == "implicit":
        reduced = simplify(expr_b.subs(z_sym, expr_a))
        curve_type, radius = _quadratic_curve_type(reduced, (x_sym, y_sym))
        return {
            "title": "Пересечение явной и неявной поверхности",
            "formula": f"{_format_expr(reduced)} = 0, z = {_format_expr(expr_a)}",
            "detail": "Выполнена подстановка z из явной поверхности в неявное уравнение.",
            "curve_type": curve_type,
            "radius": radius,
            "solutions": [f"{_format_expr(reduced)} = 0", f"z = {_format_expr(expr_a)}"],
        }

    if kind_a == "implicit" and kind_b == "implicit":
        standard_a, param_a = _detect_standard_quadric(expr_a)
        standard_b, param_b = _detect_standard_quadric(expr_b)

        standard_pair = {standard_a, standard_b}
        if standard_pair == {"sphere", "cylinder_z"}:
            sphere_radius_sq = param_a if standard_a == "sphere" else param_b
            cylinder_radius_sq = param_a if standard_a == "cylinder_z" else param_b
            z_sq = sphere_radius_sq - cylinder_radius_sq
            if z_sq < -1e-8:
                return {
                    "title": "Пересечение цилиндра и сферы",
                    "formula": "Действительных точек пересечения нет",
                    "detail": "После подстановки радиуса цилиндра в уравнение сферы получается отрицательное значение для z².",
                    "curve_type": "нет действительных решений",
                    "radius": None,
                    "solutions": [
                        f"x² + y² = {cylinder_radius_sq:.3f}",
                        f"{cylinder_radius_sq:.3f} + z² = {sphere_radius_sq:.3f}",
                        f"z² = {z_sq:.3f}",
                    ],
                }

            z_value = np.sqrt(max(z_sq, 0.0))
            curve_type = "две окружности" if z_value > 1e-8 else "окружность"
            return {
                "title": "Пересечение цилиндра и сферы",
                "formula": f"x² + y² = {cylinder_radius_sq:.3f}, z = {'±' if z_value > 1e-8 else ''}{_format_expr(simplify(np.sqrt(max(z_sq, 0.0)))) if z_value <= 1e-8 else f'√{z_sq:.3f}'}",
                "detail": (
                    f"Из цилиндра получаем x² + y² = {cylinder_radius_sq:.3f}. "
                    f"Подставляем это в сферу: {cylinder_radius_sq:.3f} + z² = {sphere_radius_sq:.3f}, "
                    f"откуда z² = {z_sq:.3f} и z = {'±' if z_value > 1e-8 else ''}{z_value:.3f}."
                ),
                "curve_type": curve_type,
                "radius": float(np.sqrt(cylinder_radius_sq)),
                "solutions": [
                    f"x² + y² = {cylinder_radius_sq:.3f}",
                    f"{cylinder_radius_sq:.3f} + z² = {sphere_radius_sq:.3f}",
                    f"z² = {z_sq:.3f}",
                    f"z = {'±' if z_value > 1e-8 else ''}{z_value:.3f}",
                    f"Итог: x² + y² = {cylinder_radius_sq:.3f}, z = {'±' if z_value > 1e-8 else ''}{z_value:.3f}",
                ],
            }

        if standard_pair == {"cone_z", "cylinder_z"}:
            cylinder_radius_sq = param_a if standard_a == "cylinder_z" else param_b
            z_value = np.sqrt(max(cylinder_radius_sq, 0.0))
            return {
                "title": "Пересечение цилиндра и конуса",
                "formula": f"x² + y² = {cylinder_radius_sq:.3f}, z = {'±' if z_value > 1e-8 else ''}{z_value:.3f}",
                "detail": (
                    f"Из цилиндра получаем x² + y² = {cylinder_radius_sq:.3f}. "
                    f"Подставляем это в конус x² + y² = z² и получаем z² = {cylinder_radius_sq:.3f}, "
                    f"то есть z = ±{z_value:.3f}."
                ),
                "curve_type": "две окружности" if z_value > 1e-8 else "окружность",
                "radius": float(np.sqrt(cylinder_radius_sq)),
                "solutions": [
                    f"x² + y² = {cylinder_radius_sq:.3f}",
                    f"z² = {cylinder_radius_sq:.3f}",
                    f"z = ±{z_value:.3f}",
                    f"Итог: x² + y² = {cylinder_radius_sq:.3f}, z = ±{z_value:.3f}",
                ],
            }

        if standard_pair == {"sphere", "cone_z"}:
            sphere_radius_sq = param_a if standard_a == "sphere" else param_b
            circle_radius_sq = sphere_radius_sq / 2.0
            z_sq = sphere_radius_sq / 2.0
            z_value = np.sqrt(max(z_sq, 0.0))
            curve_type = "две окружности" if z_value > 1e-8 else "окружность"
            z_prefix = "±" if z_value > 1e-8 else ""
            return {
                "title": "Пересечение сферы и конуса",
                "formula": f"x² + y² = {circle_radius_sq:.3f}, z = {z_prefix}{z_value:.3f}",
                "detail": (
                    "Из конуса получаем x² + y² = z². Подставляем это в сферу "
                    f"x² + y² + z² = {sphere_radius_sq:.3f} и получаем 2z² = {sphere_radius_sq:.3f}, "
                    f"то есть z² = {z_sq:.3f} и z = {z_prefix}{z_value:.3f}. "
                    f"Тогда x² + y² = {circle_radius_sq:.3f}."
                ),
                "curve_type": curve_type,
                "radius": float(np.sqrt(circle_radius_sq)),
                "solutions": [
                    "x² + y² = z²",
                    f"z² + z² = {sphere_radius_sq:.3f}",
                    f"2z² = {sphere_radius_sq:.3f}",
                    f"z² = {z_sq:.3f}",
                    f"z = {z_prefix}{z_value:.3f}",
                    f"x² + y² = {circle_radius_sq:.3f}",
                    f"Итог: x² + y² = {circle_radius_sq:.3f}, z = {z_prefix}{z_value:.3f}",
                ],
            }

        try:
            reduced = simplify(Poly(expr_a, z_sym).resultant(Poly(expr_b, z_sym)))
            curve_type, radius = _quadratic_curve_type(reduced, (x_sym, y_sym))
            return {
                "title": "Пересечение двух неявных поверхностей",
                "formula": f"{_format_expr(reduced)} = 0",
                "detail": "Получено уравнение проекции линии пересечения методом исключения z.",
                "curve_type": curve_type,
                "radius": radius,
                "solutions": [f"{_format_expr(expr_a)} = 0", f"{_format_expr(expr_b)} = 0", f"{_format_expr(reduced)} = 0"],
            }
        except Exception:
            return {
                "title": "Пересечение двух неявных поверхностей",
                "formula": f"{_format_expr(expr_a)} = 0; {_format_expr(expr_b)} = 0",
                "detail": "Система слишком сложна для точного исключения переменной, используйте численную линию пересечения на сцене.",
                "curve_type": "численное пересечение",
                "radius": None,
                "solutions": [f"{_format_expr(expr_a)} = 0", f"{_format_expr(expr_b)} = 0"],
            }

    raise ValueError("Неподдерживаемое сочетание поверхностей")


def preprocess_equation(equation: str, surface_type: str) -> str:
    """
    Предобработка уравнения перед отправкой в парсер

    Args:
        equation: исходное уравнение
        surface_type: тип поверхности (explicit, implicit, parametric)

    Returns:
        обработанное уравнение
    """
    eq = equation.strip()

    if surface_type == 'explicit':
        # Убираем z= если есть
        eq = re.sub(r'^z\s*=\s*', '', eq)
        return eq

    elif surface_type == 'implicit':
        # Для неявных функций преобразуем F(x,y,z)=0 в F(x,y,z)
        # Например: "x^2 + y^2 + z^2 = 9" -> "x^2 + y^2 + z^2 - 9"
        if '=' in eq:
            parts = eq.split('=')
            left = parts[0].strip()
            right = parts[1].strip()
            # Пытаемся определить, является ли правая часть числом
            try:
                right_num = float(right)
                eq = f"{left} - {right_num}"
            except ValueError:
                eq = f"{left} - ({right})"
        return eq

    elif surface_type == 'parametric':
        return eq

    return eq


@router.post("/surface", response_model=SurfaceResponse)
async def build_surface(request: SurfaceRequest) -> SurfaceResponse:
    """
    Построение поверхности по уравнению

    Поддерживаемые типы:
    - explicit: явная функция z = f(x, y)
    - implicit: неявная функция F(x, y, z) = 0
    - parametric: параметрическая поверхность r(u, v) = (x, y, z)
    """
    start_time = time.time()

    try:
        print(f"[INFO] Запрос: type={request.surface_type}, equation={request.equation}")

        # =========================================================
        # 1. ЯВНЫЕ ПОВЕРХНОСТИ (z = f(x, y))
        # =========================================================
        if request.surface_type == "explicit":
            print(f"[INFO] Построение явной поверхности: {request.equation}")

            # Предобработка уравнения
            eq = preprocess_equation(request.equation, 'explicit')
            print(f"[INFO] После предобработки: {eq}")

            # Парсим явную функцию
            f_func, fx_func, fy_func = parser.parse_explicit(eq)

            # Генерируем сетку
            X, Y, Z = generator.generate_grid_explicit(
                f_func,
                request.x_min, request.x_max,
                request.y_min, request.y_max,
                request.resolution
            )

            # Вычисляем нормали
            normals = normal_calc.compute_normals_explicit(fx_func, fy_func, X, Y)

            # Создаем данные для полигональной сетки
            vertices, indices = generator.create_mesh_data(X, Y, Z, request.resolution)
            bounds = generator.get_bounds(X, Y, Z)
            normals_list = normal_calc.flatten_normals(normals)

            computation_time = time.time() - start_time

            return SurfaceResponse(
                vertices=vertices,
                indices=indices,
                normals=normals_list,
                bounds=bounds,
                computation_time=computation_time
            )

        # =========================================================
        # 2. НЕЯВНЫЕ ПОВЕРХНОСТИ (F(x, y, z) = 0)
        # =========================================================
        elif request.surface_type == "implicit":
            print(f"[INFO] Построение неявной поверхности: {request.equation}")

            # Предобработка уравнения
            eq = preprocess_equation(request.equation, 'implicit')

            # Защита от NaN
            if 'NaN' in eq:
                eq = eq.replace('NaN', '0')

            print(f"[INFO] После предобработки: {eq}")

            # Парсим неявную функцию
            try:
                f_func = parser.parse_implicit(eq)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Ошибка парсинга уравнения: {str(e)}")

            # Настраиваем границы
            bounds = {
                'x_min': request.x_min,
                'x_max': request.x_max,
                'y_min': request.y_min,
                'y_max': request.y_max,
                'z_min': request.z_min if request.z_min is not None else -3,
                'z_max': request.z_max if request.z_max is not None else 3
            }

            # Запускаем Marching Cubes с защитой от ошибок
            try:
                mc = MarchingCubes(f_func, bounds, request.resolution)
                vertices, indices = mc.extract_surface(iso_value=0.0)
            except TypeError as e:
                # Если ошибка с NaN, пробуем с другими границами
                print(f"[WARNING] Ошибка с NaN, пробуем другие границы: {str(e)}")
                bounds = {
                    'x_min': -2.5, 'x_max': 2.5,
                    'y_min': -2.5, 'y_max': 2.5,
                    'z_min': -2.5, 'z_max': 2.5
                }
                mc = MarchingCubes(f_func, bounds, request.resolution)
                vertices, indices = mc.extract_surface(iso_value=0.0)

            computation_time = time.time() - start_time
            print(f"[INFO] Неявная поверхность построена за {computation_time:.3f} сек")
            print(f"[INFO] Вершин: {len(vertices)}, Треугольников: {len(indices) // 3}")

            return SurfaceResponse(
                vertices=vertices,
                indices=indices,
                normals=None,
                bounds=bounds,
                computation_time=computation_time
            )
        # =========================================================
        # 3. ПАРАМЕТРИЧЕСКИЕ ПОВЕРХНОСТИ
        # =========================================================
        elif request.surface_type == "parametric":
            print(f"[INFO] Построение параметрической поверхности")

            if not all([request.param_x_expr, request.param_y_expr, request.param_z_expr]):
                raise ValueError(
                    "Для параметрической поверхности необходимо указать "
                    "param_x_expr, param_y_expr, param_z_expr"
                )

            x_func, y_func, z_func, get_derivatives = parser.parse_parametric(
                request.param_x_expr,
                request.param_y_expr,
                request.param_z_expr
            )

            X, Y, Z = generator.generate_grid_parametric(
                x_func, y_func, z_func,
                request.param_u_min or 0, request.param_u_max or 6.28318,
                request.param_v_min or 0, request.param_v_max or 6.28318,
                request.resolution
            )

            xu_func, xv_func, yu_func, yv_func, zu_func, zv_func = get_derivatives()
            u = np.linspace(request.param_u_min or 0, request.param_u_max or 6.28318, request.resolution)
            v = np.linspace(request.param_v_min or 0, request.param_v_max or 6.28318, request.resolution)
            U, V = np.meshgrid(u, v)

            normals = normal_calc.compute_normals_parametric(
                xu_func, xv_func, yu_func, yv_func, zu_func, zv_func,
                U, V
            )

            vertices, indices = generator.create_mesh_data(X, Y, Z, request.resolution)
            bounds = generator.get_bounds(X, Y, Z)
            normals_list = normal_calc.flatten_normals(normals)

            computation_time = time.time() - start_time

            return SurfaceResponse(
                vertices=vertices,
                indices=indices,
                normals=normals_list,
                bounds=bounds,
                computation_time=computation_time
            )

        else:
            raise ValueError(
                f"Неподдерживаемый тип поверхности: {request.surface_type}. "
                f"Доступные типы: explicit, implicit, parametric"
            )

    except ValueError as e:
        print(f"[ERROR] Ошибка валидации: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        print(f"[ERROR] Внутренняя ошибка: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка сервера: {str(e)}")


@router.post("/normal", response_model=NormalResponse)
async def compute_normal(request: NormalRequest) -> NormalResponse:
    """
    Вычисление вектора нормали в заданной точке

    Для явных функций: n = (-fx, -fy, 1)
    """
    try:
        if request.surface_type == "explicit":
            eq = preprocess_equation(request.equation, 'explicit')
            _, fx_func, fy_func = parser.parse_explicit(eq)
            fx_val = fx_func(request.x, request.y)
            fy_val = fy_func(request.x, request.y)
            normal = [-float(fx_val), -float(fy_val), 1.0]
        else:
            normal = [0.0, 0.0, 1.0]

        # Нормализуем вектор
        norm_len = np.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2)
        if norm_len > 1e-10:
            normalized_normal = [n / norm_len for n in normal]
        else:
            normalized_normal = [0.0, 0.0, 1.0]

        return NormalResponse(
            normal=normal,
            normalized_normal=normalized_normal
        )

    except Exception as e:
        print(f"[ERROR] Ошибка вычисления нормали: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")


@router.post("/curvature", response_model=CurvatureResponse)
async def compute_curvature(request: CurvatureRequest) -> CurvatureResponse:
    """Вычисление коэффициентов квадратичных форм и кривизн в точке."""
    try:
        if request.surface_type == "explicit":
            eq = preprocess_equation(request.equation, 'explicit')
            derivatives = parser.parse_explicit_curvature(eq)
            result = curvature_calc.compute_explicit(
                derivatives,
                float(request.x or 0.0),
                float(request.y or 0.0),
            )
        elif request.surface_type == "parametric":
            if not all([request.param_x_expr, request.param_y_expr, request.param_z_expr]):
                raise ValueError("Для параметрической поверхности нужно передать param_x_expr, param_y_expr, param_z_expr")

            derivatives = parser.parse_parametric_curvature(
                request.param_x_expr,
                request.param_y_expr,
                request.param_z_expr
            )
            result = curvature_calc.compute_parametric(
                derivatives,
                float(request.u or 0.0),
                float(request.v or 0.0),
            )
        else:
            raise ValueError("Вычисление кривизны пока поддерживается для явных и параметрических поверхностей")

        return CurvatureResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[ERROR] Ошибка вычисления кривизны: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка вычисления кривизны: {str(e)}")


@router.post("/equation-analysis", response_model=EquationAnalysisResponse)
async def analyze_equation(request: EquationAnalysisRequest) -> EquationAnalysisResponse:
    """Символьный анализ уравнения поверхности для учебного решателя."""
    try:
        critical_points = []
        extrema_summary = "Расширенный анализ экстремумов пока доступен для явных поверхностей z = f(x, y)."

        if request.surface_type == "explicit":
            expr = sympify(preprocess_equation(request.equation, 'explicit'))
            zero_level = f"z = 0 -> {_format_expr(expr)} = 0"
            xoy_intersection = zero_level
            xoz_intersection = f"y = 0 -> z = {_format_expr(expr.subs(y_sym, 0))}"
            yoz_intersection = f"x = 0 -> z = {_format_expr(expr.subs(x_sym, 0))}"
            critical_points = _find_explicit_critical_points(expr)

            if critical_points:
                extrema_summary = f"Найдено критических точек: {len(critical_points)}"
            else:
                extrema_summary = "Критические точки не найдены ни символьно, ни численным поиском."

        elif request.surface_type == "implicit":
            expr = sympify(preprocess_equation(request.equation, 'implicit'))
            xoy_intersection = f"XOY (z = 0): {_format_expr(expr.subs(z_sym, 0))} = 0"
            xoz_intersection = f"XOZ (y = 0): {_format_expr(expr.subs(y_sym, 0))} = 0"
            yoz_intersection = f"YOZ (x = 0): {_format_expr(expr.subs(x_sym, 0))} = 0"
            zero_level = f"При z = 0 получаем: {_format_expr(expr.subs(z_sym, 0))} = 0"
            extrema_summary = "Для неявных поверхностей решатель показывает пересечения с координатными плоскостями. Экстремумы в этом режиме не ищутся."
        else:
            zero_level = "Для параметрических поверхностей решатель корней пока не поддерживается."
            xoy_intersection = "Недоступно"
            xoz_intersection = "Недоступно"
            yoz_intersection = "Недоступно"

        return EquationAnalysisResponse(
            zero_level=zero_level,
            xoy_intersection=xoy_intersection,
            xoz_intersection=xoz_intersection,
            yoz_intersection=yoz_intersection,
            critical_points=critical_points,
            extrema_summary=extrema_summary,
        )
    except (ValueError, SympifyError) as e:
        raise HTTPException(status_code=400, detail=f"Ошибка анализа уравнения: {str(e)}")
    except Exception as e:
        print(f"[ERROR] Ошибка анализа уравнения: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка анализа уравнения: {str(e)}")


@router.post("/system-analysis", response_model=SystemAnalysisResponse)
async def analyze_system(request: SystemAnalysisRequest) -> SystemAnalysisResponse:
    """Более точный анализ системы двух уравнений поверхностей."""
    try:
        result = _analyze_system(request.surface_a, request.surface_b)
        return SystemAnalysisResponse(**result)
    except (ValueError, SympifyError) as e:
        raise HTTPException(status_code=400, detail=f"Ошибка анализа системы: {str(e)}")
    except Exception as e:
        print(f"[ERROR] Ошибка анализа системы: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка анализа системы: {str(e)}")


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """Проверка работоспособности сервера"""
    return {
        "status": "ok",
        "message": "Сервер работает",
        "version": "1.0.0"
    }


@router.get("/info")
async def get_info() -> Dict[str, Any]:
    """Информация о доступных типах поверхностей"""
    return {
        "surface_types": ["explicit", "implicit", "parametric"],
        "examples": {
            "explicit": [
                "x^2 + y^2",
                "x^2 - y^2",
                "sin(x)*cos(y)",
                "exp(-(x^2 + y^2))"
            ],
            "implicit": [
                "x^2 + y^2 + z^2 - 9",
                "x^2 + y^2 - z^2",
                "x^2 + y^2 - 4",
                "x^3 + y^3 + z^3 - 1"
            ],
            "parametric": [
                "sin(u)*cos(v), sin(u)*sin(v), cos(u)"
            ]
        },
        "supported_functions": [
            "sin", "cos", "tan", "asin", "acos", "atan",
            "sinh", "cosh", "tanh",
            "exp", "log", "sqrt",
            "+", "-", "*", "/", "**"
        ]
    }
