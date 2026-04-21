import numpy as np
from typing import Tuple, Callable


class NormalCalculator:
    """Класс для вычисления векторов нормалей"""

    @staticmethod
    def _ensure_grid_shape(values, template: np.ndarray) -> np.ndarray:
        """Приводит скалярные и совместимые значения к форме расчетной сетки."""
        array = np.asarray(values, dtype=float)
        if array.shape == ():
            return np.full_like(template, float(array), dtype=float)
        if array.shape != template.shape:
            return np.broadcast_to(array, template.shape).astype(float)
        return array.astype(float)

    @staticmethod
    def compute_normals_explicit(
            fx_func: Callable, fy_func: Callable,
            X: np.ndarray, Y: np.ndarray
    ) -> np.ndarray:
        """
        Вычисление нормалей для явной функции z = f(x, y)
        Нормаль: n = (-fx, -fy, 1)
        """
        # Вычисляем частные производные
        Zx = NormalCalculator._ensure_grid_shape(fx_func(X, Y), X)
        Zy = NormalCalculator._ensure_grid_shape(fy_func(X, Y), X)

        # Создаем массив нормалей
        normals = np.stack([-Zx, -Zy, np.ones_like(Zx)], axis=-1)

        # Нормализуем
        norm = np.linalg.norm(normals, axis=-1, keepdims=True)
        normals_normalized = normals / norm

        return normals_normalized

    @staticmethod
    def compute_normals_parametric(
            xu_func, xv_func, yu_func, yv_func, zu_func, zv_func,
            U: np.ndarray, V: np.ndarray
    ) -> np.ndarray:
        """
        Вычисление нормалей для параметрической поверхности
        Нормаль: n = r_u × r_v (векторное произведение)
        """
        # Вычисляем частные производные
        ru = np.stack([
            NormalCalculator._ensure_grid_shape(xu_func(U, V), U),
            NormalCalculator._ensure_grid_shape(yu_func(U, V), U),
            NormalCalculator._ensure_grid_shape(zu_func(U, V), U)
        ], axis=-1)
        rv = np.stack([
            NormalCalculator._ensure_grid_shape(xv_func(U, V), U),
            NormalCalculator._ensure_grid_shape(yv_func(U, V), U),
            NormalCalculator._ensure_grid_shape(zv_func(U, V), U)
        ], axis=-1)

        # Векторное произведение
        normals = np.cross(ru, rv)

        # Нормализуем
        norm = np.linalg.norm(normals, axis=-1, keepdims=True)
        normals_normalized = normals / norm

        return normals_normalized

    @staticmethod
    def flatten_normals(normals: np.ndarray) -> list:
        """Преобразование массива нормалей в список для JSON"""
        h, w, _ = normals.shape
        result = []
        for i in range(h):
            for j in range(w):
                result.append(normals[i, j].tolist())
        return result
