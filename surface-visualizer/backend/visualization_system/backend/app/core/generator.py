# backend/app/core/generator.py
import numpy as np
from typing import Tuple, List, Callable


class SurfaceGenerator:
    """Класс для генерации полигональной сетки поверхности"""

    @staticmethod
    def _ensure_grid_shape(values, template: np.ndarray) -> np.ndarray:
        """Приводит результат вычисления к форме расчетной сетки."""
        array = np.asarray(values, dtype=float)
        if array.shape == ():
            return np.full_like(template, float(array), dtype=float)
        if array.shape != template.shape:
            return np.broadcast_to(array, template.shape).astype(float)
        return array.astype(float)

    @staticmethod
    def generate_grid_explicit(
            f_func: Callable,
            x_min: float, x_max: float,
            y_min: float, y_max: float,
            resolution: int
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Генерация сетки для явной функции z = f(x, y)"""
        # Создаем одномерные массивы координат
        x = np.linspace(x_min, x_max, resolution)
        y = np.linspace(y_min, y_max, resolution)

        # Создаем двумерные сетки
        X, Y = np.meshgrid(x, y)

        # Вычисляем Z
        Z = SurfaceGenerator._ensure_grid_shape(f_func(X, Y), X)

        return X, Y, Z

    @staticmethod
    def generate_grid_parametric(
            x_func: Callable, y_func: Callable, z_func: Callable,
            u_min: float, u_max: float,
            v_min: float, v_max: float,
            resolution: int
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Генерация сетки для параметрической поверхности"""
        u = np.linspace(u_min, u_max, resolution)
        v = np.linspace(v_min, v_max, resolution)
        U, V = np.meshgrid(u, v)

        X = SurfaceGenerator._ensure_grid_shape(x_func(U, V), U)
        Y = SurfaceGenerator._ensure_grid_shape(y_func(U, V), U)
        Z = SurfaceGenerator._ensure_grid_shape(z_func(U, V), U)

        return X, Y, Z

    @staticmethod
    def create_mesh_data(
            X: np.ndarray, Y: np.ndarray, Z: np.ndarray,
            resolution: int
    ) -> Tuple[List[List[float]], List[int]]:
        """
        Создание данных для полигональной сетки.
        Возвращает список валидных вершин и индексов треугольников.
        """
        rows, cols = X.shape
        vertices: List[List[float]] = []
        index_map = np.full((rows, cols), -1, dtype=int)

        for i in range(rows):
            for j in range(cols):
                point = (X[i, j], Y[i, j], Z[i, j])
                if not np.all(np.isfinite(point)):
                    continue

                index_map[i, j] = len(vertices)
                vertices.append([float(point[0]), float(point[1]), float(point[2])])

        indices: List[int] = []

        for i in range(rows - 1):
            for j in range(cols - 1):
                a = index_map[i, j]
                b = index_map[i, j + 1]
                c = index_map[i + 1, j]
                d = index_map[i + 1, j + 1]

                if a >= 0 and b >= 0 and c >= 0:
                    indices.extend([a, c, b])

                if b >= 0 and c >= 0 and d >= 0:
                    indices.extend([b, c, d])

        return vertices, indices

    @staticmethod
    def get_bounds(X, Y, Z) -> dict:
        """Вычисление границ поверхности"""
        finite_x = X[np.isfinite(X)]
        finite_y = Y[np.isfinite(Y)]
        finite_z = Z[np.isfinite(Z)]

        if finite_x.size == 0 or finite_y.size == 0 or finite_z.size == 0:
            return {
                "x_min": 0.0,
                "x_max": 0.0,
                "y_min": 0.0,
                "y_max": 0.0,
                "z_min": 0.0,
                "z_max": 0.0
            }

        return {
            "x_min": float(np.min(finite_x)),
            "x_max": float(np.max(finite_x)),
            "y_min": float(np.min(finite_y)),
            "y_max": float(np.max(finite_y)),
            "z_min": float(np.min(finite_z)),
            "z_max": float(np.max(finite_z))
        }
