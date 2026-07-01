"use client";

import { useEffect } from "react";

import { appPath } from "@/utils/appPath";

export default function Home() {
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (token) {
      window.location.href = appPath("dashboard");
    } else {
      window.location.href = appPath("login");
    }
  }, []);

  return <p>Cargando ALVENT ERP...</p>;
}