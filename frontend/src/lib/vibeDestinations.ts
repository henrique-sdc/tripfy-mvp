// Destinos da vibe — catálogo estático ranqueado por interests (Home).
// Zero LLM: mapa fixo = custo zero e carrossel instantâneo (ponytail).

import type { TravelPreferences } from "@/lib/api";
import type { VibeDestination } from "@/components/home/VibeDestinationCard";

type DestCatalogEntry = VibeDestination & {
  /** Tags alinhadas ao enum Interest do backend. */
  tags: string[];
};

const CATALOG: DestCatalogEntry[] = [
  {
    id: "dest-bali",
    image:
      "https://images.unsplash.com/photo-1537996194471-e657df975ab4?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.bali",
    vibeKey: "home.vibe.match.bali",
    tags: ["beaches", "wellness", "adventure_sports", "street_food"],
  },
  {
    id: "dest-lisbon",
    image:
      "https://images.unsplash.com/photo-1588535684923-900727736ac0?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.lisbon",
    vibeKey: "home.vibe.match.lisbon",
    tags: ["cafes", "viewpoints", "history_architecture", "street_food"],
  },
  {
    id: "dest-tokyo",
    image:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.tokyo",
    vibeKey: "home.vibe.match.tokyo",
    tags: ["street_food", "nightlife", "shopping", "art_museums"],
  },
  {
    id: "dest-rio",
    image:
      "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.rio",
    vibeKey: "home.vibe.match.rio",
    tags: ["beaches", "viewpoints", "nightlife", "festivals_events"],
  },
  {
    id: "dest-rome",
    image:
      "https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.rome",
    vibeKey: "home.vibe.match.rome",
    tags: ["history_architecture", "fine_dining", "art_museums", "cafes"],
  },
  {
    id: "dest-nyc",
    image:
      "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.nyc",
    vibeKey: "home.vibe.match.nyc",
    tags: ["nightlife", "shopping", "art_museums", "fine_dining", "bars"],
  },
  {
    id: "dest-patagonia",
    image:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.patagonia",
    vibeKey: "home.vibe.match.patagonia",
    tags: ["mountains", "adventure_sports", "viewpoints"],
  },
];

const DEFAULT_LIMIT = 5;

/** Ranqueia o catálogo pelos interesses; sem prefs → primeiros do catálogo. */
export function getRecommendedDestinations(
  preferences: Pick<TravelPreferences, "interests"> | null | undefined,
  limit = DEFAULT_LIMIT,
): VibeDestination[] {
  const interests = new Set(
    (preferences?.interests ?? []).map((i) => i.trim()).filter(Boolean),
  );

  const scored = CATALOG.map((dest) => {
    let score = 0;
    for (const tag of dest.tags) {
      if (interests.has(tag)) score += 1;
    }
    return { dest, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Empate: ordem do catálogo (estável / previsível).
    return CATALOG.indexOf(a.dest) - CATALOG.indexOf(b.dest);
  });

  return scored.slice(0, Math.max(1, limit)).map(({ dest }) => ({
    id: dest.id,
    image: dest.image,
    nameKey: dest.nameKey,
    vibeKey: dest.vibeKey,
  }));
}
