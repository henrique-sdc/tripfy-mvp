// Layout do grupo de rotas autenticadas com bottom tabs (RF04).
// Renderiza o navegador de tabs; o acesso a este grupo é guardado por
// Stack.Protected no layout raiz (só entra quem está logado e com preferências).

import AppTabs from '@/components/app-tabs';

export default function TabsLayout() {
  return <AppTabs />;
}
