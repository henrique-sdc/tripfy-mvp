// Valores espelhados dos enums Pydantic (backend/models/user.py).
// Mantém frontend e backend sincronizados — snake_case no fio.

export const INTERESTS = [
  { value: "history_architecture", emoji: "🏰", labelKey: "onboarding.vibe.interests.historyArchitecture" },
  { value: "street_food", emoji: "🌮", labelKey: "onboarding.vibe.interests.streetFood" },
  { value: "fine_dining", emoji: "🍷", labelKey: "onboarding.vibe.interests.fineDining" },
  { value: "cafes", emoji: "☕", labelKey: "onboarding.vibe.interests.cafes" },
  { value: "nightlife", emoji: "🪩", labelKey: "onboarding.vibe.interests.nightlife" },
  { value: "bars", emoji: "🍻", labelKey: "onboarding.vibe.interests.bars" },
  { value: "art_museums", emoji: "🎨", labelKey: "onboarding.vibe.interests.artMuseums" },
  { value: "beaches", emoji: "🏖️", labelKey: "onboarding.vibe.interests.beaches" },
  { value: "mountains", emoji: "⛰️", labelKey: "onboarding.vibe.interests.mountains" },
  { value: "viewpoints", emoji: "📸", labelKey: "onboarding.vibe.interests.viewpoints" },
  { value: "shopping", emoji: "🛍️", labelKey: "onboarding.vibe.interests.shopping" },
  { value: "adventure_sports", emoji: "🏂", labelKey: "onboarding.vibe.interests.adventureSports" },
  { value: "wellness", emoji: "🧘‍♀️", labelKey: "onboarding.vibe.interests.wellness" },
  { value: "festivals_events", emoji: "🎭", labelKey: "onboarding.vibe.interests.festivalsEvents" },
] as const;

export const PACE_OPTIONS = [
  { value: "intense", emoji: "🏃‍♂️", titleKey: "onboarding.vibe.pace.intense.title", descKey: "onboarding.vibe.pace.intense.desc" },
  { value: "balanced", emoji: "🚶‍♂️", titleKey: "onboarding.vibe.pace.balanced.title", descKey: "onboarding.vibe.pace.balanced.desc" },
  { value: "relaxed", emoji: "☕", titleKey: "onboarding.vibe.pace.relaxed.title", descKey: "onboarding.vibe.pace.relaxed.desc" },
] as const;

export const TRANSPORT_OPTIONS = [
  { value: "walking", emoji: "👟", labelKey: "onboarding.vibe.transport.walking" },
  { value: "public_transit", emoji: "🚇", labelKey: "onboarding.vibe.transport.publicTransit" },
  { value: "ride_hail", emoji: "🚗", labelKey: "onboarding.vibe.transport.rideHail" },
] as const;

export const DIETARY_OPTIONS = [
  { value: "none", emoji: "🥩", labelKey: "onboarding.vibe.dietary.none" },
  { value: "vegetarian", emoji: "🥗", labelKey: "onboarding.vibe.dietary.vegetarian" },
  { value: "vegan", emoji: "🌱", labelKey: "onboarding.vibe.dietary.vegan" },
] as const;

export const BUDGET_OPTIONS = [
  { value: "economy", labelKey: "onboarding.budget.economy" },
  { value: "moderate", labelKey: "onboarding.budget.moderate" },
  { value: "premium", labelKey: "onboarding.budget.premium" },
] as const;

export const TRAVELER_OPTIONS = [
  { value: "solo", labelKey: "onboarding.travelerType.solo" },
  { value: "couple", labelKey: "onboarding.travelerType.couple" },
  { value: "friends", labelKey: "onboarding.travelerType.friends" },
  { value: "family", labelKey: "onboarding.travelerType.family" },
] as const;
