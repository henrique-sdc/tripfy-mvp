// TELA DE TESTE — NativeWind v5 + Tailwind v4
// Objetivo: validar visualmente que className está funcionando antes de codar features.
// Delete ou substitua por login quando o teste passar.

import { StatusBar } from "expo-status-bar";
import { Pressable, ScrollView, Text, View } from "@/tw";

export default function TailwindFireTest() {
  return (
    <View className="flex-1 bg-slate-950">
      <StatusBar style="light" />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 py-16 gap-6"
      >
        <View className="gap-1">
          <Text className="text-slate-400 text-sm font-medium tracking-widest uppercase">
            Tripfy MVP
          </Text>
          <Text className="text-white text-4xl font-bold">Tailwind ✅</Text>
          <Text className="text-slate-400 text-base">
            Se você está vendo cores e estilos, o NativeWind v5 está funcionando.
          </Text>
        </View>

        <View className="bg-blue-600 rounded-2xl p-5 gap-3">
          <Text className="text-blue-100 text-xs font-semibold tracking-widest uppercase">
            Status
          </Text>
          <Text className="text-white text-2xl font-bold">Motor de IA Pronto</Text>
          <Text className="text-blue-200 text-sm leading-relaxed">
            Gemini 3.5 Flash conectado via SSE. Latência percebida: zero.
          </Text>
          <View className="flex-row gap-2 mt-1">
            <View className="bg-blue-500 rounded-full px-3 py-1">
              <Text className="text-white text-xs font-medium">Streaming ativo</Text>
            </View>
            <View className="bg-blue-800 rounded-full px-3 py-1">
              <Text className="text-blue-200 text-xs font-medium">Firebase OK</Text>
            </View>
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 bg-slate-800 rounded-2xl p-4 gap-2">
            <Text className="text-2xl">🗺️</Text>
            <Text className="text-white font-semibold text-sm">Roteiro IA</Text>
            <Text className="text-slate-400 text-xs leading-relaxed">
              Gerado em segundos com Gemini Flash
            </Text>
          </View>
          <View className="flex-1 bg-slate-800 rounded-2xl p-4 gap-2">
            <Text className="text-2xl">🤝</Text>
            <Text className="text-white font-semibold text-sm">Match</Text>
            <Text className="text-slate-400 text-xs leading-relaxed">
              Killer feature: viagens em grupo
            </Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 bg-violet-900 rounded-2xl p-4 gap-2">
            <Text className="text-2xl">⚡</Text>
            <Text className="text-white font-semibold text-sm">SSE / Stream</Text>
            <Text className="text-violet-300 text-xs leading-relaxed">
              Resposta token a token
            </Text>
          </View>
          <View className="flex-1 bg-slate-800 rounded-2xl p-4 gap-2">
            <Text className="text-2xl">🔐</Text>
            <Text className="text-white font-semibold text-sm">Auth</Text>
            <Text className="text-slate-400 text-xs leading-relaxed">
              Firebase Authentication
            </Text>
          </View>
        </View>

        <View className="bg-slate-800 rounded-2xl p-5 gap-2">
          <Text className="text-slate-400 text-xs tracking-widest uppercase font-medium">
            Checklist de Classes
          </Text>
          {[
            { label: "bg-* (background)", ok: true },
            { label: "text-* (cores de texto)", ok: true },
            { label: "rounded-* (bordas)", ok: true },
            { label: "p-* / gap-* (espaçamento)", ok: true },
            { label: "flex-row / flex-1 (layout)", ok: true },
            { label: "text-xs/sm/base/2xl (tipografia)", ok: true },
            { label: "font-bold / font-medium", ok: true },
          ].map((item) => (
            <View key={item.label} className="flex-row items-center gap-3 py-1">
              <View
                className={`w-5 h-5 rounded-full items-center justify-center ${
                  item.ok ? "bg-emerald-500" : "bg-red-500"
                }`}
              >
                <Text className="text-white text-xs font-bold">
                  {item.ok ? "✓" : "✗"}
                </Text>
              </View>
              <Text className="text-slate-300 text-sm">{item.label}</Text>
            </View>
          ))}
        </View>

        <Pressable
          className="bg-blue-600 rounded-2xl py-4 items-center active:bg-blue-700"
          onPress={() => console.log("Tailwind + NativeWind funcionando!")}
        >
          <Text className="text-white font-bold text-base">
            Tudo funcionando — Próximo: Login 🚀
          </Text>
        </Pressable>

        <Text className="text-slate-600 text-xs text-center">
          Tripfy MVP · NativeWind v5 · Tailwind v4 · Expo SDK 57
        </Text>
      </ScrollView>
    </View>
  );
}
