// Wrappers obrigatórios para className com react-native-css (NativeWind v5).
// Reexporta componentes já instrumentados — nunca importe View/Text de react-native com className.
import Animated from "react-native-reanimated";
import {
  Pressable as CssPressable,
  Text as CssText,
  View as CssView,
} from "react-native-css/components";

export {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native-css/components";

// `Animated.View`/`Animated.Text` crus engolem className em silêncio: o metro roda
// com `globalClassNamePolyfill: false`, então só o que sai de `react-native-css`
// entende a prop. Anime sempre por estes — o className continua valendo.
export const AnimatedView = Animated.createAnimatedComponent(CssView);
export const AnimatedText = Animated.createAnimatedComponent(CssText);
export const AnimatedPressable = Animated.createAnimatedComponent(CssPressable);
