from pydantic import BaseModel
from typing import Optional, List


class SurfaceRequest(BaseModel):
    """Модель запроса для построения поверхности"""
    equation: str
    surface_type: str  # "explicit", "implicit", "parametric"

    # Для явных и неявных функций
    x_min: float = -3.0
    x_max: float = 3.0
    y_min: float = -3.0
    y_max: float = 3.0
    z_min: float = -3.0
    z_max: float = 3.0
    resolution: int = 50

    # Для параметрических поверхностей
    param_u_min: Optional[float] = 0.0
    param_u_max: Optional[float] = 6.28318
    param_v_min: Optional[float] = 0.0
    param_v_max: Optional[float] = 6.28318
    param_x_expr: Optional[str] = None
    param_y_expr: Optional[str] = None
    param_z_expr: Optional[str] = None


class SurfaceResponse(BaseModel):
    """Модель ответа для построения поверхности"""
    vertices: List[List[float]]
    indices: List[int]
    normals: Optional[List[List[float]]] = None
    bounds: dict
    computation_time: float


class NormalRequest(BaseModel):
    """Модель запроса для вычисления нормали в точке"""
    equation: str
    surface_type: str  # "explicit", "implicit", "parametric"

    # Для явных функций
    x: float = 0.0
    y: float = 0.0
    z: Optional[float] = None

    # Для неявных функций
    z_imp: Optional[float] = None

    # Для параметрических функций
    u: Optional[float] = 0.0
    v: Optional[float] = 0.0
    param_x_expr: Optional[str] = None
    param_y_expr: Optional[str] = None
    param_z_expr: Optional[str] = None


class NormalResponse(BaseModel):
    """Модель ответа для нормали"""
    normal: List[float]
    normalized_normal: List[float]


class CurvatureRequest(BaseModel):
    """Модель запроса для вычисления дифференциально-геометрических характеристик"""
    equation: str
    surface_type: str
    x: Optional[float] = 0.0
    y: Optional[float] = 0.0
    z: Optional[float] = 0.0
    u: Optional[float] = 0.0
    v: Optional[float] = 0.0
    param_x_expr: Optional[str] = None
    param_y_expr: Optional[str] = None
    param_z_expr: Optional[str] = None


class CurvatureResponse(BaseModel):
    """Модель ответа для кривизны и квадратичных форм"""
    E: float
    F: float
    G: float
    L: float
    M: float
    N: float
    gaussian: float
    mean: float
    principal1: float
    principal2: float
    point_type: str
    point_type_ru: str


class CriticalPointResponse(BaseModel):
    x: float
    y: float
    z: float
    point_type: str
    point_type_ru: str


class EquationAnalysisRequest(BaseModel):
    equation: str
    surface_type: str
    param_x_expr: Optional[str] = None
    param_y_expr: Optional[str] = None
    param_z_expr: Optional[str] = None


class EquationAnalysisResponse(BaseModel):
    zero_level: str
    xoy_intersection: str
    xoz_intersection: str
    yoz_intersection: str
    critical_points: List[CriticalPointResponse]
    extrema_summary: str


class SurfaceDescriptor(BaseModel):
    equation: str
    surface_type: str
    param_x_expr: Optional[str] = None
    param_y_expr: Optional[str] = None
    param_z_expr: Optional[str] = None


class SystemAnalysisRequest(BaseModel):
    surface_a: SurfaceDescriptor
    surface_b: SurfaceDescriptor


class SystemAnalysisResponse(BaseModel):
    title: str
    formula: str
    detail: str
    curve_type: str
    radius: Optional[float] = None
    solutions: List[str] = []


class ErrorResponse(BaseModel):
    """Модель ответа при ошибке"""
    error: str
    details: Optional[str] = None
