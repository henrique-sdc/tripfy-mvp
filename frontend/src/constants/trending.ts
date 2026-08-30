// Catálogo curado "Em Alta" (RF08) — Home + tela /trending.
// Fase 1: dados locais; busca/filtro no cliente.

export type TrendingRegion =
  | "brasil"
  | "europa"
  | "asia"
  | "americas"
  | "oceania";

export type TrendingTag =
  | "praia"
  | "cidade"
  | "cultura"
  | "natureza"
  | "gastronomia";

export type TrendingCategoryId = "all" | TrendingRegion | TrendingTag;

export type TrendingItinerary = {
  id: string;
  image: string;
  titleKey: string;
  authorKey: string;
  /** Destino canônico — pré-preenche o wizard. */
  destination: string;
  region: TrendingRegion;
  tags: TrendingTag[];
  /** Duração sugerida (dias inclusivos) — opcional no wizard. */
  daysHint?: number;
  /** Aliases pra busca (já em minúsculas, sem acento de preferência). */
  searchText: string;
};

export type TrendingCategory = {
  id: TrendingCategoryId;
  kind: "all" | "region" | "tag";
  labelKey: string;
};

export const TRENDING_CATEGORIES: TrendingCategory[] = [
  { id: "all", kind: "all", labelKey: "trending.categories.all" },
  { id: "brasil", kind: "region", labelKey: "trending.categories.brasil" },
  { id: "europa", kind: "region", labelKey: "trending.categories.europa" },
  { id: "asia", kind: "region", labelKey: "trending.categories.asia" },
  { id: "americas", kind: "region", labelKey: "trending.categories.americas" },
  { id: "praia", kind: "tag", labelKey: "trending.categories.praia" },
  { id: "cidade", kind: "tag", labelKey: "trending.categories.cidade" },
  { id: "cultura", kind: "tag", labelKey: "trending.categories.cultura" },
  { id: "natureza", kind: "tag", labelKey: "trending.categories.natureza" },
];

export const TRENDING_ITINERARIES: TrendingItinerary[] = [
  {
    id: "trend-ba",
    image:
      "https://images.unsplash.com/photo-1589909202802-8f4aadce1849?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.ba.title",
    authorKey: "home.trending.items.ba.author",
    destination: "Buenos Aires, Argentina",
    region: "americas",
    tags: ["cidade", "cultura", "gastronomia"],
    daysHint: 4,
    searchText: "buenos aires argentina ba tango",
  },
  {
    id: "trend-sp",
    image:
      "https://images.unsplash.com/photo-1617853570203-63c7584c9ccd?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.sp.title",
    authorKey: "home.trending.items.sp.author",
    destination: "São Paulo, Brasil",
    region: "brasil",
    tags: ["cidade", "gastronomia"],
    daysHint: 3,
    searchText: "sao paulo sp brasil gastronomia",
  },
  {
    id: "trend-paris",
    image:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.paris.title",
    authorKey: "home.trending.items.paris.author",
    destination: "Paris, França",
    region: "europa",
    tags: ["cidade", "cultura"],
    daysHint: 5,
    searchText: "paris franca france europa",
  },
  {
    id: "trend-nyc",
    image:
      "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.nyc.title",
    authorKey: "home.trending.items.nyc.author",
    destination: "Nova York, EUA",
    region: "americas",
    tags: ["cidade"],
    daysHint: 5,
    searchText: "nova york new york nyc eua usa",
  },
  {
    id: "trend-rome",
    image:
      "https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.rome.title",
    authorKey: "home.trending.items.rome.author",
    destination: "Roma, Itália",
    region: "europa",
    tags: ["cidade", "cultura", "gastronomia"],
    daysHint: 4,
    searchText: "roma italia italy gelato",
  },
  {
    id: "trend-bali",
    image:
      "https://images.unsplash.com/photo-1537996194471-e657df975ab4?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.bali.title",
    authorKey: "home.trending.items.bali.author",
    destination: "Bali, Indonésia",
    region: "asia",
    tags: ["praia", "natureza", "cultura"],
    daysHint: 7,
    searchText: "bali indonesia asia praia temples",
  },
  {
    id: "trend-rio",
    image:
      "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.rio.title",
    authorKey: "home.trending.items.rio.author",
    destination: "Rio de Janeiro, Brasil",
    region: "brasil",
    tags: ["praia", "cidade", "natureza"],
    daysHint: 5,
    searchText: "rio de janeiro brasil praia cristo",
  },
  {
    id: "trend-lisbon",
    image:
      "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.lisbon.title",
    authorKey: "home.trending.items.lisbon.author",
    destination: "Lisboa, Portugal",
    region: "europa",
    tags: ["cidade", "cultura", "gastronomia"],
    daysHint: 4,
    searchText: "lisboa lisbon portugal europa",
  },
  {
    id: "trend-tokyo",
    image:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.tokyo.title",
    authorKey: "home.trending.items.tokyo.author",
    destination: "Tóquio, Japão",
    region: "asia",
    tags: ["cidade", "gastronomia", "cultura"],
    daysHint: 6,
    searchText: "toquio tokyo japao japan asia",
  },
  {
    id: "trend-florianopolis",
    image:
      "https://images.unsplash.com/photo-1590523277543-a94d2e4eb17b?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.floripa.title",
    authorKey: "home.trending.items.floripa.author",
    destination: "Florianópolis, Brasil",
    region: "brasil",
    tags: ["praia", "natureza"],
    daysHint: 5,
    searchText: "florianopolis floripa brasil praia",
  },
  {
    id: "trend-barcelona",
    image:
      "https://images.unsplash.com/photo-1583422409516-2895a77efded?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.barcelona.title",
    authorKey: "home.trending.items.barcelona.author",
    destination: "Barcelona, Espanha",
    region: "europa",
    tags: ["cidade", "cultura", "praia"],
    daysHint: 5,
    searchText: "barcelona espanha spain europa gaudi",
  },
  {
    id: "trend-cancun",
    image:
      "https://images.unsplash.com/photo-1519046904884-53103b34b206?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.cancun.title",
    authorKey: "home.trending.items.cancun.author",
    destination: "Cancún, México",
    region: "americas",
    tags: ["praia"],
    daysHint: 6,
    searchText: "cancun mexico caribe praia",
  },
  {
    id: "trend-chapada",
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.chapada.title",
    authorKey: "home.trending.items.chapada.author",
    destination: "Chapada Diamantina, Brasil",
    region: "brasil",
    tags: ["natureza"],
    daysHint: 5,
    searchText: "chapada diamantina bahia brasil natureza trilha",
  },
  {
    id: "trend-seoul",
    image:
      "https://images.unsplash.com/photo-1517154421773-0529f29ea451?q=80&w=1000&auto=format&fit=crop",
    titleKey: "home.trending.items.seoul.title",
    authorKey: "home.trending.items.seoul.author",
    destination: "Seul, Coreia do Sul",
    region: "asia",
    tags: ["cidade", "gastronomia", "cultura"],
    daysHint: 5,
    searchText: "seul seoul coreia korea asia",
  },
];

/** Remove acentos e lowercase pra match de busca. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function filterTrendingItineraries(
  items: readonly TrendingItinerary[],
  opts: {
    category: TrendingCategoryId;
    query: string;
    /** Título já traduzido por id — busca no locale do usuário. */
    resolveTitle: (item: TrendingItinerary) => string;
  },
): TrendingItinerary[] {
  const cat = TRENDING_CATEGORIES.find((c) => c.id === opts.category);
  const q = normalizeSearch(opts.query);

  return items.filter((item) => {
    if (cat && cat.kind === "region" && item.region !== cat.id) return false;
    if (cat && cat.kind === "tag") {
      if (!item.tags.includes(cat.id as TrendingTag)) return false;
    }
    if (!q) return true;
    const hay = normalizeSearch(
      `${item.destination} ${opts.resolveTitle(item)} ${item.searchText}`,
    );
    return hay.includes(q);
  });
}

/** Href do wizard Solo com destino (e dias opcionais). */
export function trendingWizardHref(item: TrendingItinerary): string {
  const params = new URLSearchParams({
    destination: item.destination,
  });
  if (item.daysHint != null && item.daysHint >= 1) {
    params.set("days", String(item.daysHint));
  }
  return `/wizard/solo?${params.toString()}`;
}
