// Debounce do typeahead de destino — sem lodash.
// 400ms + AbortController: cada letra cancela o timer e o fetch anterior.

import { useEffect, useState } from "react";

import {
  autocompletePlaces,
  type PlaceAutocompleteItem,
} from "@/lib/api";

const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

export function usePlacesAutocomplete(query: string): {
  predictions: PlaceAutocompleteItem[];
  loading: boolean;
  error: boolean;
  /** True depois que o fetch desta query terminou (evita "vazio" no debounce). */
  settled: boolean;
} {
  const [predictions, setPredictions] = useState<PlaceAutocompleteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_CHARS) {
      setPredictions([]);
      setLoading(false);
      setError(false);
      setSettled(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setSettled(false);
    const timer = setTimeout(() => {
      setLoading(true);
      setError(false);
      autocompletePlaces(trimmed, controller.signal)
        .then((items) => {
          if (cancelled || controller.signal.aborted) return;
          setPredictions(items);
          setLoading(false);
          setSettled(true);
        })
        .catch((err) => {
          if (cancelled || controller.signal.aborted) return;
          console.warn("[autocomplete] falha ao buscar destinos:", err);
          setPredictions([]);
          setLoading(false);
          setError(true);
          setSettled(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { predictions, loading, error, settled };
}
