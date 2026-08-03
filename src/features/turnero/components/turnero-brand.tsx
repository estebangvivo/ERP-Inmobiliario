"use client";

import { createContext, useContext } from "react";

export type TurneroBrand = {
  name: string;
  logoUrl: string | null;
};

const TurneroBrandContext = createContext<TurneroBrand>({
  name: "Turnero",
  logoUrl: null,
});

export function TurneroBrandProvider({
  brand,
  children,
}: {
  brand: TurneroBrand;
  children: React.ReactNode;
}) {
  return (
    <TurneroBrandContext.Provider value={brand}>
      {children}
    </TurneroBrandContext.Provider>
  );
}

export function useTurneroBrand() {
  return useContext(TurneroBrandContext);
}

type TurneroLogoProps = {
  /** Tamaño del contenedor (clases Tailwind), default size-20 */
  sizeClass?: string;
  className?: string;
  /** Mostrar nombre debajo/al lado */
  showName?: boolean;
  nameClassName?: string;
};

/** Logo de la organización (Configuración) o fallback "T". */
export function TurneroLogo({
  sizeClass = "size-20",
  className = "",
  showName = false,
  nameClassName = "mt-3 text-lg font-bold text-white",
}: TurneroLogoProps) {
  const { name, logoUrl } = useTurneroBrand();

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name}
          className={`${sizeClass} rounded-2xl object-contain bg-white/5 p-1.5`}
        />
      ) : (
        <span
          className={`grid ${sizeClass} place-items-center rounded-full bg-[var(--turnero-accent)] text-3xl font-extrabold text-[var(--turnero-accent-foreground)]`}
        >
          {name.trim().charAt(0).toUpperCase() || "T"}
        </span>
      )}
      {showName && <p className={nameClassName}>{name}</p>}
    </div>
  );
}
