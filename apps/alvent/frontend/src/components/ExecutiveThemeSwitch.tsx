"use client";

import { useExecutiveTheme } from "@/hooks/useExecutiveTheme";
import styles from "./ExecutiveThemeSwitch.module.css";

type ExecutiveThemeSwitchProps = {
  className?: string;
};

export default function ExecutiveThemeSwitch({ className }: ExecutiveThemeSwitchProps) {
  const { isExecutiveDark, toggleExecutiveTheme } = useExecutiveTheme();

  return (
    <button
      type="button"
      onClick={toggleExecutiveTheme}
      className={`${styles.switch} ${className || ""} focus-ring`}
      aria-pressed={isExecutiveDark}
      aria-label="Alternar tema ejecutivo"
    >
      <span className={styles.label}>Executive Dark</span>
      <span className={`${styles.pill} ${isExecutiveDark ? styles.active : ""}`}>
        <span className={styles.dot} />
      </span>
    </button>
  );
}
