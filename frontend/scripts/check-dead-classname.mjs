// Guarda contra o bug que quebrou a UI no iOS 26.
//
// O metro roda com `globalClassNamePolyfill: false` (exigido pela regra
// expo-tailwind-setup). Nesse modo só os componentes reexportados por `src/tw`
// entendem `className` — em qualquer outro a prop é aceita e descartada em
// silêncio: sem erro, sem warning, sem estilo. Foi assim que o botão do Google
// perdeu o `flex-row` e empilhou o ícone em cima do texto.
//
// Rode: node scripts/check-dead-classname.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/** Componentes de terceiros que nunca passam pelo react-native-css. */
const NEVER_STYLED = new Set([
  "BlurView",
  "GlassView",
  "GlassContainer",
  "GlassSurface",
  "LinearGradient",
  "Swipeable",
  "SwipeToDelete",
  "MapView",
  "WebView",
  "DraggableFlatList",
]);

/** Importados de "react-native" direto — a versão crua, não a instrumentada. */
const RN_COMPONENTS = new Set([
  "ActivityIndicator",
  "FlatList",
  "Image",
  "ImageBackground",
  "KeyboardAvoidingView",
  "Modal",
  "Pressable",
  "SafeAreaView",
  "ScrollView",
  "SectionList",
  "Switch",
  "Text",
  "TextInput",
  "TouchableOpacity",
  "TouchableHighlight",
  "View",
  "VirtualizedList",
]);

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/** Nomes locais importados de "react-native" que são componentes. */
function rawRnComponents(source) {
  const names = new Set();
  const importRe = /import\s*\{([\s\S]*?)\}\s*from\s*["']react-native["']/g;
  for (const [, body] of source.matchAll(importRe)) {
    for (const part of body.split(",")) {
      const [original, alias] = part.split(/\s+as\s+/).map((s) => s.trim());
      if (RN_COMPONENTS.has(original)) names.add(alias || original);
    }
  }
  return names;
}

/**
 * Fim da tag JSX aberta em `start`, ignorando `>` dentro de string ou de
 * expressão `{...}` (arrow functions em props disparam falso positivo sem isso).
 */
function tagEnd(source, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return i;
  }
  return source.length;
}

/** Linhas com className morto em um arquivo. */
function scan(source) {
  const banned = new Set([...NEVER_STYLED, ...rawRnComponents(source)]);
  const hits = [];

  // `Animated.View` e afins: o wrapper do reanimated não repassa className.
  const tagRe = /<(Animated\.[A-Z]\w*|[A-Z]\w*)/g;
  for (const match of source.matchAll(tagRe)) {
    const tag = match[1];
    if (!tag.startsWith("Animated.") && !banned.has(tag)) continue;

    const open = source.slice(match.index, tagEnd(source, match.index));
    if (!/\bclassName\s*=/.test(open)) continue;

    hits.push({ tag, line: source.slice(0, match.index).split("\n").length });
  }

  return hits;
}

// Autoteste: um detector que nunca dispara passa despercebido pra sempre.
{
  const bad = `import { BlurView } from "expo-blur";
    <BlurView intensity={40} className="flex-row items-center" />`;
  const animated = `<Animated.View style={s} className="h-2 bg-white" />`;
  const rawRn = `import { View } from "react-native";
    <View className="flex-1" />`;
  const okWrapped = `import { View } from "@/tw";
    <View className="flex-1" />`;
  // Arrow function na prop: o `>` da seta não pode encerrar a tag.
  const okArrow = `import { View } from "react-native";
    <View onLayout={(e) => setW(e.width)} style={{ flex: 1 }} />`;

  const expect = (label, source, want) => {
    const got = scan(source).length;
    if (got !== want) {
      throw new Error(`autoteste "${label}": esperava ${want}, veio ${got}`);
    }
  };

  expect("BlurView com className", bad, 1);
  expect("Animated.View com className", animated, 1);
  expect("View cru do react-native", rawRn, 1);
  expect("View do @/tw", okWrapped, 0);
  expect("arrow function na prop", okArrow, 0);
}

const findings = [];

for (const file of walk(SRC)) {
  const source = readFileSync(file, "utf8");
  for (const { tag, line } of scan(source)) {
    findings.push(`${relative(SRC, file)}:${line}  <${tag} className=...>`);
  }
}

if (findings.length > 0) {
  console.error(
    `className morto em ${findings.length} lugar(es) — a prop é ignorada nesses componentes:\n`,
  );
  for (const f of findings) console.error(`  ${f}`);
  console.error(
    "\nUse `style={{...}}`, ou troque por um componente de `@/tw` (View, Text, AnimatedView...).",
  );
  process.exit(1);
}

console.log("OK: nenhum className morto.");
