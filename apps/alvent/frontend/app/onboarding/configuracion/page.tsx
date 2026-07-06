"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/utils/appPath";

export default function OnboardingConfiguracionRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(appPath("/configuracion#cfg-empresa"));
  }, [router]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <p style={{ color: "#334155", fontWeight: 600 }}>
        Redirigiendo a Informacion de la empresa...
      </p>
    </main>
  );
}
