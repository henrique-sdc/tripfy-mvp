// Cliente HTTP do backend Tripfy.
// Injeta automaticamente o ID Token do Firebase no header Authorization.
// Não guardamos token manualmente: o SDK do Firebase gerencia/renova o token
// (com a persistência configurada em firebase.ts), e pedimos um fresco a cada
// chamada via getIdToken() — padrão oficial recomendado para RN/Expo.

import { auth } from "@/lib/firebase";

// Sem fallback para localhost: em device físico (Expo Go) localhost aponta
// para o próprio celular, não para o PC — mascararia o erro real de rede em
// vez de avisar que EXPO_PUBLIC_API_URL está ausente/mal configurada.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const API_PREFIX = "/api/v1";

// Erro estruturado para a UI diferenciar falha de rede de erro do servidor.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Backend inalcançável (DNS/conexão recusada/timeout) — distinto de ApiError,
// que representa uma resposta HTTP de erro (o servidor respondeu, só que mal).
// A UI trata isso como "modo degradado", nunca como bloqueio de navegação.
export class NetworkError extends Error {
  constructor(message = "Não foi possível conectar ao servidor.") {
    super(message);
    this.name = "NetworkError";
  }
}

// Tipos espelhando os schemas Pydantic do backend (snake_case no fio).
export type TravelPreferences = {
  interests: string[];
  pace: string;
  transport_modes: string[];
  dietary_style: string;
  budget_range: string;
  traveler_type: string;
};

export type SyncResponse = {
  uid: string;
  email: string;
  has_preferences: boolean;
};

/** Wrapper de fetch que injeta o Bearer token e valida a resposta. */
async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  if (!BASE_URL) {
    // Erro de configuração, não de rede — falha alto e claro em dev.
    throw new Error(
      "EXPO_PUBLIC_API_URL não configurada. Defina no frontend/.env.",
    );
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ApiError(401, "Usuário não autenticado.");
  }

  const token = await currentUser.getIdToken();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  } catch (error) {
    // O próprio fetch() falhou (ex.: ConnectException) — backend inalcançável
    // na rede, não um erro de aplicação. Log preserva a causa original.
    console.error("[api] Falha de rede ao chamar o backend:", error);
    throw new NetworkError();
  }

  if (!response.ok) {
    // Não confiamos cegamente no corpo; extraímos detail quando houver.
    let detail = `Erro ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      // corpo vazio ou não-JSON — mantém a mensagem padrão
    }
    throw new ApiError(response.status, detail);
  }

  return response;
}

/** POST /auth/sync — cria/sincroniza o usuário e informa se tem preferências. */
export async function syncUser(): Promise<SyncResponse> {
  const response = await authFetch("/auth/sync", { method: "POST" });
  return (await response.json()) as SyncResponse;
}

/** PUT /auth/preferences — salva as preferências do onboarding. */
export async function savePreferences(
  preferences: TravelPreferences,
): Promise<void> {
  await authFetch("/auth/preferences", {
    method: "PUT",
    body: JSON.stringify({ preferences }),
  });
}
