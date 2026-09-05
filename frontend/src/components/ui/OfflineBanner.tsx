// Banner discreto exibido quando o backend está inalcançável (Missão 1).
// Nunca bloqueia navegação — é só um aviso no topo da tela, com fade suave.
// Some automaticamente quando a conexão volta (backendUnreachable === false).

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { AnimatedView, Text, View } from '@/tw';
import { useAuthStore } from '@/stores/authStore';

export function OfflineBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const backendUnreachable = useAuthStore((s) => s.backendUnreachable);

  if (!backendUnreachable) return null;

  return (
    <AnimatedView
      entering={FadeInDown.duration(250)}
      exiting={FadeOutUp.duration(200)}
      style={{ paddingTop: insets.top + 8 }}
      className="absolute top-0 left-0 right-0 z-50 items-center px-4"
    >
      <View className="bg-amber-500/95 rounded-full px-4 py-2 shadow-lg">
        <Text className="text-white text-xs font-medium text-center">
          {t('common.offlineBanner')}
        </Text>
      </View>
    </AnimatedView>
  );
}
