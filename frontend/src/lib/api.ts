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
  /** Dicas geradas pela LLM específicas do destino (3–5). */
  tips?: string[];
  /** Notas pessoais do usuário (não vêm da LLM). */
  notes?: string;
  days: ItineraryDayResponse[];
};

/** Espelho de PlaceDetailsResponse do proxy Places (RF07). */
export type PlaceDetailsResponse = {
  place_id: string | null;
  photo_url: string | null;
  rating: number | null;
  reviews_count: number | null;
  open_now: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** Espelho de PlaceFullDetailsResponse — Knowledge Panel. */
export type PlaceFullDetailsResponse = {
  place_id: string;
  name: string | null;
  formatted_address: string | null;
  phone: string | null;
  website: string | null;
  editorial_summary: string | null;
  weekday_text: string[];
  open_now: boolean | null;
  rating: number | null;
  reviews_count: number | null;
  photo_urls: string[];
  latitude: number | null;
  longitude: number | null;
  price_level: string | null;
  menu_uri: string | null;
};

export type PlaceReviewCreate = {
  rating: number;
  comment: string;
};

export type PlaceReviewResponse = {
  id: string;
  place_id: string;
  user_uid: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string | null;
};

// Cache de sessão — FlatList remonta cards ao trocar o dia; evita re-bater Places.
const placeDetailsCache = new Map<string, PlaceDetailsResponse>();
// Full details por place_id — reabrir o sheet na mesma sessão não refaz o Google.
const placeFullDetailsCache = new Map<string, PlaceFullDetailsResponse>();

function placeCacheKey(
  query: string,
  lat?: number | null,
  lng?: number | null,
): string {
  return `${query.trim().toLowerCase()}|${lat ?? ""}|${lng ?? ""}`;
}

/**
 * GET /places/lookup — foto/nota/`open_now` via proxy (chave só no backend).
 * Passe lat+lng juntos para bias; omite ambos se algum for inválido.
 */
export async function getPlaceDetails(
  query: string,
  lat?: number | null,
  lng?: number | null,
  signal?: AbortSignal,
): Promise<PlaceDetailsResponse> {
  const trimmed = query.trim();
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  const key = placeCacheKey(
    trimmed,
    hasCoords ? lat : null,
    hasCoords ? lng : null,
  );
  const cached = placeDetailsCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({ query: trimmed });
  if (hasCoords) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
  }

  try {
    const response = await authFetch(`/places/lookup?${params.toString()}`, {
      method: "GET",
      signal,
    });
    const data = (await response.json()) as PlaceDetailsResponse;
    placeDetailsCache.set(key, data);
    return data;
  } catch (err) {
    // 404 / 502 / 503: cacheia vazio pra não martelar rate limit nem spammar log
    // (ex.: Places API desligada no GCP até o próximo cold start do app).
    if (
      err instanceof ApiError &&
      (err.status === 404 || err.status === 502 || err.status === 503)
    ) {
      const empty: PlaceDetailsResponse = {
        place_id: null,
        photo_url: null,
        rating: null,
        reviews_count: null,
        open_now: null,
        latitude: null,
        longitude: null,
      };
      placeDetailsCache.set(key, empty);
      return empty;
    }
    throw err;
  }
}

/** GET /places/{place_id}/details — painel rico (cache de sessão). */
export async function getPlaceFullDetails(
  placeId: string,
  signal?: AbortSignal,
): Promise<PlaceFullDetailsResponse> {
  const id = placeId.trim();
  const cached = placeFullDetailsCache.get(id);
  if (cached) return cached;

  const response = await authFetch(
    `/places/${encodeURIComponent(id)}/details`,
    { method: "GET", signal },
  );
  const data = (await response.json()) as PlaceFullDetailsResponse;
  placeFullDetailsCache.set(id, data);
  return data;
}

/** GET /places/{place_id}/reviews */
export async function getPlaceReviews(
  placeId: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<PlaceReviewResponse[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await authFetch(
    `/places/${encodeURIComponent(placeId.trim())}/reviews?${params}`,
    { method: "GET", signal },
  );
  return (await response.json()) as PlaceReviewResponse[];
}

/** POST /places/{place_id}/reviews — upsert do usuário autenticado. */
export async function upsertPlaceReview(
  placeId: string,
  body: PlaceReviewCreate,
): Promise<PlaceReviewResponse> {
  const response = await authFetch(
    `/places/${encodeURIComponent(placeId.trim())}/reviews`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  return (await response.json()) as PlaceReviewResponse;
}

/** DELETE /places/{place_id}/reviews/me */
export async function deleteOwnPlaceReview(placeId: string): Promise<void> {
  await authFetch(
    `/places/${encodeURIComponent(placeId.trim())}/reviews/me`,
    { method: "DELETE" },
  );
}

/** GET /places/reviews/me — todas as avaliações do usuário. */
export async function getMyPlaceReviews(
  limit = 50,
  signal?: AbortSignal,
): Promise<PlaceReviewResponse[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await authFetch(`/places/reviews/me?${params}`, {
    method: "GET",
    signal,
  });
  return (await response.json()) as PlaceReviewResponse[];
}

/** Espelho de SavedTripResponse do backend (CRUD / clone / deep link). */
export type SavedTripApi = {
  id: string;
  owner_uid: string;
  destination: string;
  summary: string;
  tips: string[];
  notes?: string;
  days: ItineraryDayResponse[];
  deleted_at: string | null;
  cloned_from: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_owner: boolean;
  read_only: boolean;
};

export type CloneTripResponse = {
  id: string;
  destination: string;
};

/** GET /trips — ativas do usuário. */
export async function listTripsApi(
  signal?: AbortSignal,
): Promise<SavedTripApi[]> {
  const response = await authFetch("/trips", { method: "GET", signal });
  return (await response.json()) as SavedTripApi[];
}

/** GET /trips/trash */
export async function listTrashTrips(
  signal?: AbortSignal,
): Promise<SavedTripApi[]> {
  const response = await authFetch("/trips/trash", { method: "GET", signal });
  return (await response.json()) as SavedTripApi[];
}

/** GET /trips/{id} — dono ou visitante (read_only). */
export async function getTripApi(
  tripId: string,
  signal?: AbortSignal,
): Promise<SavedTripApi> {
  const response = await authFetch(
    `/trips/${encodeURIComponent(tripId.trim())}`,
    { method: "GET", signal },
  );
  return (await response.json()) as SavedTripApi;
}

/** DELETE /trips/{id} — soft delete. */
export async function softDeleteTripApi(tripId: string): Promise<void> {
  await authFetch(`/trips/${encodeURIComponent(tripId.trim())}`, {
    method: "DELETE",
  });
}

/** POST /trips/{id}/restore */
export async function restoreTripApi(
  tripId: string,
): Promise<SavedTripApi> {
  const response = await authFetch(
    `/trips/${encodeURIComponent(tripId.trim())}/restore`,
    { method: "POST" },
  );
  return (await response.json()) as SavedTripApi;
}

/** POST /trips/{id}/clone */
export async function cloneTripApi(
  tripId: string,
): Promise<CloneTripResponse> {
  const response = await authFetch(
    `/trips/${encodeURIComponent(tripId.trim())}/clone`,
    { method: "POST" },
  );
  return (await response.json()) as CloneTripResponse;
}

export type MatchStatus = "waiting" | "generating" | "completed";

export type MatchInviteSummary = {
  id: string;
  destination: string;
  days: number;
  budget: string;
  status: MatchStatus;
};

export type MatchInDB = MatchInviteSummary & {
  owner_uid: string;
  participants: string[];
  created_at: unknown;
  generation_lock?: {
    token: string;
    locked_by: string;
    locked_at: unknown;
  } | null;
  itinerary?: ItineraryResponse | null;
  completed_at?: unknown;
};

export type CreateMatchParams = {
  destination: string;
  days: number;
  budget: string;
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

/** POST /matches — cria a sala com o usuário autenticado como owner. */
export async function createMatch(
  params: CreateMatchParams,
): Promise<MatchInDB> {
  const response = await authFetch("/matches", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return (await response.json()) as MatchInDB;
}

/** GET /matches/{id} — resumo pré-join ou visão completa do participante. */
export async function getMatch(
  matchId: string,
): Promise<MatchInviteSummary | MatchInDB> {
  const response = await authFetch(
    `/matches/${encodeURIComponent(matchId)}`,
  );
  return (await response.json()) as MatchInviteSummary | MatchInDB;
}

/** POST /matches/{id}/join — aceita o convite com o UID do token. */
export async function joinMatch(matchId: string): Promise<MatchInDB> {
  const response = await authFetch(
    `/matches/${encodeURIComponent(matchId)}/join`,
    { method: "POST" },
  );
  return (await response.json()) as MatchInDB;
}

/**
 * Consome o contrato SSE compartilhado pelas gerações Solo e Match.
 *
 * Retorna uma função `close()` para abortar (unmount / cancelamento).
 * pollingInterval: 0 desliga o auto-reconnect — geração é one-shot.
 */
function generateItineraryStream(
  path: string,
  body: Record<string, unknown> | undefined,
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

      es = new EventSource(`${BASE_URL}${API_PREFIX}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
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

/** POST /trips/generate — geração Solo. */
export function generateTripStream(
  params: GenerateTripParams,
  onToken: ((token: string) => void) | undefined,
  onComplete: (itinerary: ItineraryResponse) => void,
  onError: (error: Error) => void,
): () => void {
  return generateItineraryStream(
    "/trips/generate",
    {
      destination: params.destination,
      days: params.days,
      budget: params.budget,
      notes: params.notes ?? "",
    },
    onToken,
    onComplete,
    onError,
  );
}

/** POST /matches/{id}/generate — geração única iniciada pelo owner. */
export function generateMatchStream(
  matchId: string,
  onToken: ((token: string) => void) | undefined,
  onComplete: (itinerary: ItineraryResponse) => void,
  onError: (error: Error) => void,
): () => void {
  return generateItineraryStream(
    `/matches/${encodeURIComponent(matchId)}/generate`,
    undefined,
    onToken,
    onComplete,
    onError,
  );
}
