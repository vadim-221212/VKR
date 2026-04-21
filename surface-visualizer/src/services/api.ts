import axios from 'axios';
import type { 
  SurfaceRequest, 
  SurfaceResponse, 
  NormalRequest, 
  NormalResponse,
  CurvatureRequest,
  CurvatureResponse,
  EquationAnalysisRequest,
  EquationAnalysisResponse,
  SystemAnalysisRequest,
  SystemAnalysisResponse,
} from '../types/surface.ts';

// Базовый URL бэкенда:
// - в production берется из VITE_API_BASE_URL
// - локально по умолчанию используется FastAPI на 127.0.0.1:8000
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || 'http://127.0.0.1:8000/api';

// Создаем экземпляр axios с настройками по умолчанию
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 секунд таймаут
  headers: {
    'Content-Type': 'application/json',
  },
});

// Интерцептор для логирования запросов (полезно для отладки)
apiClient.interceptors.request.use(
  (config) => {
    console.log(`📤 [API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ [API] Request error:', error);
    return Promise.reject(error);
  }
);

// Интерцептор для логирования ответов
apiClient.interceptors.response.use(
  (response) => {
    console.log(`📥 [API] ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    if (error.response) {
      console.error(`❌ [API] ${error.response.status}:`, error.response.data);
    } else if (error.request) {
      console.error('❌ [API] No response from server:', error.request);
    } else {
      console.error('❌ [API] Error:', error.message);
    }
    return Promise.reject(error);
  }
);

/**
 * Построение поверхности по уравнению
 */
export async function buildSurface(request: SurfaceRequest): Promise<SurfaceResponse> {
  try {
    const response = await apiClient.post<SurfaceResponse>('/surface', request);
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw new Error('Ошибка соединения с сервером. Убедитесь, что бэкенд запущен.');
  }
}

/**
 * Вычисление нормали в заданной точке
 */
export async function computeNormal(request: NormalRequest): Promise<NormalResponse> {
  try {
    const response = await apiClient.post<NormalResponse>('/normal', request);
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw new Error('Ошибка при вычислении нормали');
  }
}

export async function computeCurvature(request: CurvatureRequest): Promise<CurvatureResponse> {
  try {
    const response = await apiClient.post<CurvatureResponse>('/curvature', request);
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw new Error('Ошибка при вычислении кривизны');
  }
}

export async function analyzeEquation(request: EquationAnalysisRequest): Promise<EquationAnalysisResponse> {
  try {
    const response = await apiClient.post<EquationAnalysisResponse>('/equation-analysis', request);
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw new Error('Ошибка при анализе уравнения');
  }
}

export async function analyzeSystem(request: SystemAnalysisRequest): Promise<SystemAnalysisResponse> {
  try {
    const response = await apiClient.post<SystemAnalysisResponse>('/system-analysis', request);
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.detail) {
      throw new Error(error.response.data.detail);
    }
    throw new Error('Ошибка при анализе системы уравнений');
  }
}

/**
 * Проверка работоспособности бэкенда
 */
export async function checkHealth(): Promise<{ status: string; message: string }> {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    throw new Error('Сервер недоступен');
  }
}

/**
 * Получение информации о доступных типах поверхностей
 */
export async function getApiInfo(): Promise<any> {
  try {
    const response = await apiClient.get('/info');
    return response.data;
  } catch (error) {
    console.error('Ошибка при получении информации API:', error);
    return null;
  }
}
