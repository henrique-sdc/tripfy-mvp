// Clique do house ad. Upsell abre o paywall que já existe.
// Afiliado reusa o deep link da Central de Reservas — sem preço no app.

import {
  buildBookingHotelsUrl,
  buildSkyscannerFlightsUrl,
} from "@/lib/affiliates";
import { canOpenHouseAdNow, type HouseAdCreative } from "@/lib/houseAds";
import * as Haptics from "@/lib/haptics";
import { openPartnerUrl } from "@/lib/openPartnerUrl";
import { usePaywallStore } from "@/stores/paywallStore";

export type HouseAdTarget = {
  destination?: string;
  startDate?: string | null;
  endDate?: string | null;
};

export async function openHouseAd(
  creative: HouseAdCreative,
  target?: HouseAdTarget,
): Promise<void> {
  if (!canOpenHouseAdNow()) {
    console.info("[ads] Clique ignorado: ainda é o toque de sair do roteiro");
    return;
  }
  const destination = target?.destination?.trim() ?? "";
  const affiliate =
    creative.kind === "affiliate" && creative.partner != null && destination;

  if (!affiliate) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.info("[ads] Upsell pelo anúncio:", creative.id);
    usePaywallStore.getState().open("manage");
    return;
  }

  const url =
    creative.partner === "skyscanner"
      ? buildSkyscannerFlightsUrl({
          destination,
          outboundDate: target?.startDate ?? undefined,
          inboundDate: target?.endDate ?? undefined,
        })
      : buildBookingHotelsUrl({
          destination,
          checkIn: target?.startDate ?? undefined,
          checkOut: target?.endDate ?? undefined,
        });
  console.info("[ads] Parceiro pelo anúncio:", creative.partner);
  await openPartnerUrl(url);
}
