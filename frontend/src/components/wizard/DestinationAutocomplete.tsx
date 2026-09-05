// Campo Destino do wizard: typeahead Google via proxy, lista flutuante.
// position absolute — não empurra datas/orçamento (sem layout shift).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { ActivityIndicator, Keyboard, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { AppText } from "@/components/ui/AppText";
import { usePlacesAutocomplete } from "@/hooks/usePlacesAutocomplete";
import { useTheme } from "@/hooks/use-theme";
import type { PlaceAutocompleteItem } from "@/lib/api";
import { Pressable } from "@/tw";

/** Destino veio do catálogo Em Alta — não é place_id do Google. */
export const CURATED_PLACE_ID = "curated";

type Props = {
  value: string;
  selectedPlaceId: string | null;
  onChangeText: (text: string) => void;
  onSelect: (item: PlaceAutocompleteItem) => void;
};

export function DestinationAutocomplete({
  value,
  selectedPlaceId,
  onChangeText,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const selected = Boolean(selectedPlaceId);
  const { predictions, loading, error, settled } = usePlacesAutocomplete(
    selected ? "" : value,
  );

  const showList = !selected && predictions.length > 0;
  const typed = value.trim().length >= 2;

  function handleSelect(item: PlaceAutocompleteItem) {
    Haptics.selectionAsync();
    Keyboard.dismiss();
    onSelect(item);
  }

  const empty =
    typed && !selected && settled && !loading && !error && predictions.length === 0;
  const hintKey = error
    ? "wizard.destinationNetworkError"
    : empty
      ? "wizard.destinationEmpty"
      : value.trim() && !selected
        ? "wizard.destinationPickHint"
        : "wizard.destinationHint";
  const hintTone = error ? "error" : "muted";

  return (
    <View style={styles.field}>
      <AppText className="text-[13px] font-semibold tracking-wide">
        {t("wizard.destinationLabel")}
      </AppText>

      <View
        collapsable={false}
        style={styles.anchor}
      >
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: theme.surface,
              borderColor: selected ? theme.accent : theme.border,
            },
          ]}
        >
          <Ionicons name="location" size={20} color={theme.accent} />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={t("wizard.destinationPlaceholder")}
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { color: theme.textPrimary }]}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="search"
          />
          {loading ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : null}
        </View>

        {showList ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            style={[
              styles.dropdown,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.textPrimary,
              },
            ]}
          >
            {predictions.map((item, index) => (
              <Pressable
                key={item.place_id}
                onPress={() => handleSelect(item)}
                style={[
                  styles.row,
                  index > 0
                    ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }
                    : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={item.description}
              >
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={theme.textSecondary}
                />
                <AppText
                  className="text-[15px]"
                  style={styles.rowLabel}
                  numberOfLines={2}
                >
                  {item.description}
                </AppText>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}
      </View>

      <AppText tone={hintTone} className="text-[11px]">
        {t(hintKey)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 10, zIndex: 20, elevation: 8, overflow: "visible" },
  anchor: {
    position: "relative",
    zIndex: 20,
    elevation: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 6,
    zIndex: 30,
    elevation: 12,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLabel: { flex: 1 },
});
