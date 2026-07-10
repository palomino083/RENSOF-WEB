"use client";

import dynamic from "next/dynamic";

const ClientPage = dynamic(() => import("./ClientPage"), {
  ssr: false,
  loading: () => (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <p style={{ color: "#334155", fontWeight: 700 }}>Cargando ALVENT...</p>
    </main>
  ),
});

export default function Page() {
  return <ClientPage />;
}