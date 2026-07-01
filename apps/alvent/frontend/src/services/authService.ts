import { api } from "@/services/api";

/* =========================
   TYPES
========================= */

export interface RegisterRequest {
  nombres: string;
  usuario: string;
  email: string;
  password: string;
  rol: string;
}

export interface RegisterResponse {
  id: number;
  usuario: string;
  email: string;
  token: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  mensaje: string;
}

export interface ResetPasswordRequest {
  password: string;
  confirmPassword: string;
}

export interface ResetPasswordResponse {
  mensaje: string;
}

interface ApiError {
  detail?: string;
  message?: string;
}

/* =========================
   SERVICE
========================= */

export async function register(
  data: RegisterRequest
): Promise<RegisterResponse> {
  try {
    const res = await api.post<RegisterResponse>(
      "/auth/register",
      data
    );

    return res.data;
  } catch (error: any) {
    const apiError: ApiError = error?.response?.data;

    throw new Error(
      apiError?.detail ||
      apiError?.message ||
      "Error en el registro de usuario"
    );
  }
}

export async function forgotPassword(
  data: ForgotPasswordRequest
): Promise<ForgotPasswordResponse> {
  try {
    const res = await api.post<ForgotPasswordResponse>(
      "/auth/forgot-password",
      data
    );

    return res.data;
  } catch (error: any) {
    const apiError: ApiError = error?.response?.data;

    throw new Error(
      apiError?.detail ||
      apiError?.message ||
      "No se pudo enviar el enlace de recuperacion"
    );
  }
}

export async function resetPassword(
  token: string,
  data: ResetPasswordRequest
): Promise<ResetPasswordResponse> {
  try {
    const res = await api.post<ResetPasswordResponse>(
      `/auth/reset-password/${token}`,
      data
    );

    return res.data;
  } catch (error: any) {
    const apiError: ApiError = error?.response?.data;

    throw new Error(
      apiError?.detail ||
      apiError?.message ||
      "No se pudo actualizar la contrasena"
    );
  }
}