import Link from "next/link";
import { appPath } from "@/utils/appPath";
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
          <Link href={appPath(accion.href)} className={styles.action}>
            {accion.label}
          </Link>
        ) : null}
      </footer>
    </section>
  );
}