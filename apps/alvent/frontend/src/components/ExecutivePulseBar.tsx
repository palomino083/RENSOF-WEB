import Link from "next/link";
import { APP_BASE_PATH, appPath } from "@/utils/appPath";
import styles from "./ExecutivePulseBar.module.css";

type PulseTone = "neutral" | "good" | "warn" | "critical";

type PulseMetric = {
  label: string;
  value: string;
  tone?: PulseTone;
};

type PulseAction = {
  label: string;
  href: string;
};

type ExecutivePulseBarProps = {
  modulo: string;
  estado: string;
  foco: string;
  metricas: PulseMetric[];
  accion?: PulseAction;
};

function resolveActionHref(href: string) {
  const raw = String(href || "").trim();
  if (!raw) return appPath("");

  if (/^https?:\/\//i.test(raw)) return raw;

  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const parts = noOrigin.match(/^([^?#]*)(.*)$/);
  let pathPart = parts?.[1] || "";
  const suffix = parts?.[2] || "";

  pathPart = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;

  const prefixedBase = `${APP_BASE_PATH}/`;
  while (pathPart.startsWith(prefixedBase)) {
    pathPart = pathPart.slice(APP_BASE_PATH.length);
  }

  if (pathPart === APP_BASE_PATH) {
    pathPart = "/";
  }

  const normalized = pathPart === "/" ? "" : pathPart;
  return `${appPath(normalized)}${suffix}`;
}

export default function ExecutivePulseBar({
  modulo,
  estado,
  foco,
  metricas,
  accion,
}: ExecutivePulseBarProps) {
  return (
    <section className={`${styles.pulse} uiEnter`} data-stagger="2">
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>Executive pulse</p>
          <h3>{modulo}</h3>
          <p>{foco}</p>
        </div>
        <span className={styles.status}>{estado}</span>
      </header>

      <ul className={styles.metrics}>
        {metricas.slice(0, 3).map((metric) => (
          <li
            key={`${metric.label}-${metric.value}`}
            className={`${styles.metric} ${styles[metric.tone || "neutral"]}`}
          >
            <span className={styles.metricLabel}>{metric.label}</span>
            <strong className={styles.metricValue}>{metric.value}</strong>
          </li>
        ))}
      </ul>

      <footer className={styles.foot}>
        <span className={styles.timestamp}>Actualizado: {new Date().toLocaleTimeString("es-PE")}</span>
        {accion ? (
          <Link href={resolveActionHref(accion.href)} className={styles.action}>
            {accion.label}
          </Link>
        ) : null}
      </footer>
    </section>
  );
}