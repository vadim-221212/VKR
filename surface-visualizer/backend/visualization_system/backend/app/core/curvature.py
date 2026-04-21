import math
import numpy as np
from typing import Dict, Callable


class CurvatureCalculator:
    """Вычисление коэффициентов квадратичных форм и кривизн."""

    @staticmethod
    def _classify_point(gaussian: float, mean: float) -> tuple[str, str]:
        eps = 1e-7
        if gaussian > eps:
            return "elliptic", "Эллиптическая точка (K > 0)"
        if gaussian < -eps:
            return "hyperbolic", "Гиперболическая точка (K < 0)"
        if abs(mean) > eps:
            return "parabolic", "Параболическая точка (K ≈ 0)"
        return "planar", "Плоская точка (K ≈ 0, H ≈ 0)"

    @staticmethod
    def _finalize(E: float, F: float, G: float, L: float, M: float, N: float) -> Dict[str, float | str]:
        denom = E * G - F * F
        if abs(denom) < 1e-10:
            raise ValueError("В точке вырождена первая квадратичная форма")

        gaussian = (L * N - M * M) / denom
        mean = (E * N - 2.0 * F * M + G * L) / (2.0 * denom)
        discriminant = max(mean * mean - gaussian, 0.0)
        root = math.sqrt(discriminant)
        principal1 = mean + root
        principal2 = mean - root
        point_type, point_type_ru = CurvatureCalculator._classify_point(gaussian, mean)

        return {
            "E": float(E),
            "F": float(F),
            "G": float(G),
            "L": float(L),
            "M": float(M),
            "N": float(N),
            "gaussian": float(gaussian),
            "mean": float(mean),
            "principal1": float(principal1),
            "principal2": float(principal2),
            "point_type": point_type,
            "point_type_ru": point_type_ru,
        }

    @staticmethod
    def compute_explicit(derivatives: Dict[str, Callable], x: float, y: float) -> Dict[str, float | str]:
        fx = float(derivatives["fx"](x, y))
        fy = float(derivatives["fy"](x, y))
        fxx = float(derivatives["fxx"](x, y))
        fxy = float(derivatives["fxy"](x, y))
        fyy = float(derivatives["fyy"](x, y))

        E = 1.0 + fx * fx
        F = fx * fy
        G = 1.0 + fy * fy

        normal_factor = math.sqrt(1.0 + fx * fx + fy * fy)
        L = fxx / normal_factor
        M = fxy / normal_factor
        N = fyy / normal_factor

        return CurvatureCalculator._finalize(E, F, G, L, M, N)

    @staticmethod
    def compute_parametric(derivatives: Dict[str, Callable], u: float, v: float) -> Dict[str, float | str]:
        ru = np.array([
            float(derivatives["xu"](u, v)),
            float(derivatives["yu"](u, v)),
            float(derivatives["zu"](u, v)),
        ])
        rv = np.array([
            float(derivatives["xv"](u, v)),
            float(derivatives["yv"](u, v)),
            float(derivatives["zv"](u, v)),
        ])
        ruu = np.array([
            float(derivatives["xuu"](u, v)),
            float(derivatives["yuu"](u, v)),
            float(derivatives["zuu"](u, v)),
        ])
        ruv = np.array([
            float(derivatives["xuv"](u, v)),
            float(derivatives["yuv"](u, v)),
            float(derivatives["zuv"](u, v)),
        ])
        rvv = np.array([
            float(derivatives["xvv"](u, v)),
            float(derivatives["yvv"](u, v)),
            float(derivatives["zvv"](u, v)),
        ])

        normal = np.cross(ru, rv)
        normal_len = float(np.linalg.norm(normal))
        if normal_len < 1e-10:
            raise ValueError("В точке вырождена параметризация поверхности")
        n = normal / normal_len

        E = float(np.dot(ru, ru))
        F = float(np.dot(ru, rv))
        G = float(np.dot(rv, rv))
        L = float(np.dot(ruu, n))
        M = float(np.dot(ruv, n))
        N = float(np.dot(rvv, n))

        return CurvatureCalculator._finalize(E, F, G, L, M, N)
