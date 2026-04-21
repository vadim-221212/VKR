from sympy import sympify, SympifyError, symbols, lambdify, diff
import numpy as np
from typing import Tuple, Callable, Optional


class ExpressionParser:
    """Класс для парсинга и обработки математических выражений"""

    def __init__(self):
        self.x = symbols('x')
        self.y = symbols('y')
        self.z = symbols('z')
        self.u = symbols('u')
        self.v = symbols('v')

    def parse_explicit(self, equation_str: str) -> Tuple[Callable, Callable, Callable]:
        """
        Парсинг явной функции z = f(x, y)
        Возвращает функции для f, fx, fy
        """
        try:
            # Преобразуем строку в символьное выражение
            expr = sympify(equation_str)

            # Проверяем, что выражение содержит только x и y
            free_symbols = expr.free_symbols
            for sym in free_symbols:
                if str(sym) not in ['x', 'y']:
                    raise ValueError(f"Обнаружена неизвестная переменная: {sym}. Используйте только x и y")

            # Вычисляем частные производные
            fx = diff(expr, self.x)
            fy = diff(expr, self.y)

            # Создаем численные функции для быстрых вычислений
            f_func = lambdify((self.x, self.y), expr, modules='numpy')
            fx_func = lambdify((self.x, self.y), fx, modules='numpy')
            fy_func = lambdify((self.x, self.y), fy, modules='numpy')

            return f_func, fx_func, fy_func

        except SympifyError as e:
            raise ValueError(f"Синтаксическая ошибка в уравнении: {str(e)}")
        except Exception as e:
            raise ValueError(f"Ошибка при обработке выражения: {str(e)}")

    def parse_parametric(self, x_expr: str, y_expr: str, z_expr: str) -> Tuple[
        Callable, Callable, Callable, Callable, Callable]:
        """
        Парсинг параметрической поверхности
        Возвращает функции для x, y, z и их частные производные
        """
        try:
            x_sym = sympify(x_expr)
            y_sym = sympify(y_expr)
            z_sym = sympify(z_expr)

            # Частные производные по u и v
            xu = diff(x_sym, self.u)
            xv = diff(x_sym, self.v)
            yu = diff(y_sym, self.u)
            yv = diff(y_sym, self.v)
            zu = diff(z_sym, self.u)
            zv = diff(z_sym, self.v)

            # Создаем численные функции
            x_func = lambdify((self.u, self.v), x_sym, modules='numpy')
            y_func = lambdify((self.u, self.v), y_sym, modules='numpy')
            z_func = lambdify((self.u, self.v), z_sym, modules='numpy')

            # Функции для производных (нужны для нормалей)
            def get_derivatives_funcs():
                xu_func = lambdify((self.u, self.v), xu, modules='numpy')
                xv_func = lambdify((self.u, self.v), xv, modules='numpy')
                yu_func = lambdify((self.u, self.v), yu, modules='numpy')
                yv_func = lambdify((self.u, self.v), yv, modules='numpy')
                zu_func = lambdify((self.u, self.v), zu, modules='numpy')
                zv_func = lambdify((self.u, self.v), zv, modules='numpy')
                return xu_func, xv_func, yu_func, yv_func, zu_func, zv_func

            return x_func, y_func, z_func, get_derivatives_funcs

        except SympifyError as e:
            raise ValueError(f"Синтаксическая ошибка в параметрическом уравнении: {str(e)}")

    def parse_implicit(self, equation_str: str) -> Callable:
        """
        Парсинг неявной функции F(x, y, z) = 0
        Возвращает функцию для вычисления F
        """
        try:
            expr = sympify(equation_str)
            f_func = lambdify((self.x, self.y, self.z), expr, modules='numpy')
            return f_func
        except SympifyError as e:
            raise ValueError(f"Синтаксическая ошибка в неявном уравнении: {str(e)}")

    def parse_explicit_curvature(self, equation_str: str) -> dict:
        """Парсинг производных до второго порядка для явной поверхности z = f(x, y)."""
        try:
            expr = sympify(equation_str)
            free_symbols = expr.free_symbols
            for sym in free_symbols:
                if str(sym) not in ['x', 'y']:
                    raise ValueError(f"Обнаружена неизвестная переменная: {sym}. Используйте только x и y")

            fx = diff(expr, self.x)
            fy = diff(expr, self.y)
            fxx = diff(fx, self.x)
            fxy = diff(fx, self.y)
            fyy = diff(fy, self.y)

            return {
                "f": lambdify((self.x, self.y), expr, modules='numpy'),
                "fx": lambdify((self.x, self.y), fx, modules='numpy'),
                "fy": lambdify((self.x, self.y), fy, modules='numpy'),
                "fxx": lambdify((self.x, self.y), fxx, modules='numpy'),
                "fxy": lambdify((self.x, self.y), fxy, modules='numpy'),
                "fyy": lambdify((self.x, self.y), fyy, modules='numpy'),
            }
        except SympifyError as e:
            raise ValueError(f"Синтаксическая ошибка в уравнении: {str(e)}")
        except Exception as e:
            raise ValueError(f"Ошибка при обработке выражения: {str(e)}")

    def parse_parametric_curvature(self, x_expr: str, y_expr: str, z_expr: str) -> dict:
        """Парсинг первых и вторых производных параметрической поверхности."""
        try:
            x_sym = sympify(x_expr)
            y_sym = sympify(y_expr)
            z_sym = sympify(z_expr)

            xu = diff(x_sym, self.u)
            xv = diff(x_sym, self.v)
            xuu = diff(xu, self.u)
            xuv = diff(xu, self.v)
            xvv = diff(xv, self.v)

            yu = diff(y_sym, self.u)
            yv = diff(y_sym, self.v)
            yuu = diff(yu, self.u)
            yuv = diff(yu, self.v)
            yvv = diff(yv, self.v)

            zu = diff(z_sym, self.u)
            zv = diff(z_sym, self.v)
            zuu = diff(zu, self.u)
            zuv = diff(zu, self.v)
            zvv = diff(zv, self.v)

            return {
                "x": lambdify((self.u, self.v), x_sym, modules='numpy'),
                "y": lambdify((self.u, self.v), y_sym, modules='numpy'),
                "z": lambdify((self.u, self.v), z_sym, modules='numpy'),
                "xu": lambdify((self.u, self.v), xu, modules='numpy'),
                "xv": lambdify((self.u, self.v), xv, modules='numpy'),
                "xuu": lambdify((self.u, self.v), xuu, modules='numpy'),
                "xuv": lambdify((self.u, self.v), xuv, modules='numpy'),
                "xvv": lambdify((self.u, self.v), xvv, modules='numpy'),
                "yu": lambdify((self.u, self.v), yu, modules='numpy'),
                "yv": lambdify((self.u, self.v), yv, modules='numpy'),
                "yuu": lambdify((self.u, self.v), yuu, modules='numpy'),
                "yuv": lambdify((self.u, self.v), yuv, modules='numpy'),
                "yvv": lambdify((self.u, self.v), yvv, modules='numpy'),
                "zu": lambdify((self.u, self.v), zu, modules='numpy'),
                "zv": lambdify((self.u, self.v), zv, modules='numpy'),
                "zuu": lambdify((self.u, self.v), zuu, modules='numpy'),
                "zuv": lambdify((self.u, self.v), zuv, modules='numpy'),
                "zvv": lambdify((self.u, self.v), zvv, modules='numpy'),
            }
        except SympifyError as e:
            raise ValueError(f"Синтаксическая ошибка в параметрическом уравнении: {str(e)}")
