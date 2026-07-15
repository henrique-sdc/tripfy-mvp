// Cliente HTTP do backend Tripfy.
// Injeta automaticamente o ID Token do Firebase no header Authorization.
// Não guardamos token manualmente: o SDK do Firebase gerencia/renova o token
// (com a persistência configurada em firebase.ts), e pedimos um fresco a cada
// chamada via getIdToken() — padrão oficial recomendado para RN/Expo.

import EventSource from "react-native-sse";

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
  other_preferences?: string;
};

export type SyncResponse = {
  uid: string;
  email: string;
  has_preferences: boolean;
};

export type GenerateTripParams = {
  destination: string;
  days: number;
  budget: string;
  notes?: string;
};

/** Espelho de ItineraryResponse / ActivityResponse do backend. */
export type ActivityResponse = {
  time: string;
  title: string;
  description: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type ItineraryDayResponse = {
  day: number;
  title: string;
  activities: ActivityResponse[];
};

export type ItineraryResponse = {
  destination: string;
  summary: string;
  days: ItineraryDayResponse[];
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

/**
 * POST /trips/generate — consome SSE de fragmentos JSON do roteiro.
 *
 * Retorna uma função `close()` para abortar (unmount / cancelamento).
 * pollingInterval: 0 desliga o auto-reconnect — geração é one-shot.
 */
export function generateTripStream(
  params: GenerateTripParams,
  onToken: ((token: string) => void) | undefined,
  onComplete: (itinerary: ItineraryResponse) => void,
  onError: (error: Error) => void,
): () => void {
  if (!BASE_URL) {
    onError(
      new Error(
        "EXPO_PUBLIC_API_URL não configurada. Defina no frontend/.env.",
      ),
    );
    return () => undefined;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    onError(new ApiError(401, "Usuário não autenticado."));
    return () => undefined;
  }

  let closed = false;
  let accumulated = "";
  let es: EventSource | null = null;

  const close = () => {
    if (closed) return;
    closed = true;
    es?.removeAllEventListeners();
    es?.close();
    es = null;
  };

  // Token fresco antes de abrir o EventSource (não fica em AsyncStorage).
  currentUser
    .getIdToken()
    .then((token) => {
      if (closed) return;

      es = new EventSource(`${BASE_URL}${API_PREFIX}/trips/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          destination: params.destination,
          days: params.days,
          budget: params.budget,
          notes: params.notes ?? "",
        }),
        // Sem retry automático: se falhar, a UI decide se tenta de novo.
        pollingInterval: 0,
      });

      es.addEventListener("message", (event) => {
        if (closed || event.data == null) return;

        let payload: {
          token?: string;
          done?: boolean;
          error?: string;
        };
        try {
          payload = JSON.parse(event.data) as typeof payload;
        } catch {
          onError(new Error("Resposta SSE inválida do servidor."));
          close();
          return;
        }

        if (payload.error) {
          onError(new Error(payload.error));
          close();
          return;
        }

        if (typeof payload.token === "string") {
          accumulated += payload.token;
          onToken?.(payload.token);
          return;
        }

        if (payload.done === true) {
          try {
            const itinerary = JSON.parse(accumulated) as ItineraryResponse;
            if (!itinerary?.destination || !Array.isArray(itinerary.days)) {
              throw new Error("Roteiro incompleto.");
            }
            // Observabilidade local — espelho do log do backend no stream.
            console.info(
              "[LLM Response] Roteiro parseado:",
              JSON.stringify(itinerary, null, 2),
            );
            onComplete(itinerary);
          } catch (err) {
            console.error("[api] Falha ao parsear roteiro acumulado:", err);
            onError(new Error("Não foi possível montar o roteiro gerado."));
          }
          close();
        }
      });

      es.addEventListener("error", (event) => {
        if (closed) return;

        if (event.type === "error") {
          const status = event.xhrStatus;
          if (status === 401) {
            onError(new ApiError(401, "Sessão expirada. Entre de novo."));
          } else if (status === 503) {
            onError(
              new ApiError(503, "Geração temporariamente indisponível."),
            );
          } else if (status === 429) {
            onError(
              new ApiError(429, "Muitas tentativas. Aguarde um minuto."),
            );
          } else if (status > 0) {
            onError(new ApiError(status, event.message || `Erro ${status}`));
          } else {
            onError(new NetworkError());
          }
        } else if (event.type === "exception") {
          onError(event.error ?? new Error(event.message));
        } else {
          onError(new NetworkError());
        }
        close();
      });
    })
    .catch((err) => {
      onError(err instanceof Error ? err : new Error(String(err)));
    });

  return close;
}
