// Link de navegação com cor legível no Dark Mode.
// O Link do Expo Router com className text-accent sofre o mesmo bug do Text.

import { Link, type LinkProps } from "expo-router";
import type { ReactNode } from "react";

import { AppText } from "@/components/ui/AppText";
import { Pressable } from "@/tw";

type AuthLinkProps = Omit<LinkProps, "children"> & {
  children: ReactNode;
  className?: string;
};

export function AuthLink({ children, className, ...props }: AuthLinkProps) {
  return (
    <Link {...props} asChild>
      <Pressable>
        <AppText tone="accent" className={className}>
          {children}
        </AppText>
      </Pressable>
    </Link>
  );
}
