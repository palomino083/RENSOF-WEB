import styles from "./PlanVisualCards.module.css";
import { getPlanGovernanceProfile } from "../visualNarrative";

type PlanAccent = "free" | "basic" | "pro" | "premium";
type PlanIcon = "spark" | "chart" | "user" | "rocket" | "crown" | "shield" | "briefcase";

export type PlanVisualCardBenefit = {
  icon: PlanIcon;
  text: string;
};

export type PlanVisualCardItem = {
  key: string;
  titulo: string;
  subtitulo: string;
  lema: string;
  accentClass: PlanAccent;
  precio: string;
  beneficios: PlanVisualCardBenefit[];
  esActual?: boolean;
};

type Props = {
  cards: PlanVisualCardItem[];
};

const renderBenefitIcon = (icon: PlanIcon) => {
  if (icon === "spark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l1.9 4.8L19 10l-5.1 2.2L12 17l-1.9-4.8L5 10l5.1-2.2L12 3z" />
      </svg>
    );
  }
  if (icon === "chart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h16M7 16V9m5 7V5m5 11v-4" />
      </svg>
    );
  }
  if (icon === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" />
      </svg>
    );
  }
  if (icon === "rocket") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19l4-1 7-7a6 6 0 001-8 6 6 0 00-8 1l-7 7-1 4 4-1zM9 15l-2 2" />
      </svg>
    );
  }
  if (icon === "crown") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 18h18l-2-10-5 4-2-4-2 4-5-4-2 10z" />
      </svg>
    );
  }
  if (icon === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8h18v11H3V8zm6-3h6v3H9V5zM3 12h18" />
    </svg>
  );
};

export default function PlanVisualCards({ cards }: Props) {
  return (
    <div className={styles.planVisualGrid}>
      {cards.map((plan, index) => {
        const governance = getPlanGovernanceProfile(plan.key);

        return (
        <article
          key={`visual-${plan.key}`}
          className={`${styles.planVisualCard} ${styles[`planVisualCard_${plan.accentClass}`]} ${index === 0 ? styles.planVisualCardFree : ""}`}
        >
          <div className={styles.planVisualCardHead}>
            <span className={styles.planVisualPill}>{plan.titulo}</span>
            <small>{plan.esActual ? "Plan activo" : plan.subtitulo}</small>
          </div>
          <div className={styles.planVisualPriceWrap}>
            <strong>{plan.precio}</strong>
            <span>por mes</span>
          </div>
          <div className={styles.planVisualPriceDivider} aria-hidden="true" />
          <p className={styles.planVisualLema}>{plan.lema}</p>
          <ul className={styles.planVisualList}>
            {plan.beneficios.map((item) => (
              <li key={`${plan.key}-${item.text}`}>
                <span className={styles.planVisualIcon}>{renderBenefitIcon(item.icon)}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>

          <section className={styles.planVisualTrust}>
            <header className={styles.planVisualTrustHead}>
              <strong>Seguridad</strong>
              <small>Disponibilidad {governance.disponibilidad}</small>
            </header>
            <ul className={styles.planVisualTrustList}>
              {governance.seguridad.slice(0, 2).map((item) => (
                <li key={`${plan.key}-seg-${item}`}>{item}</li>
              ))}
            </ul>

            <header className={styles.planVisualTrustHead}>
              <strong>Servicio</strong>
              <small>Soporte {governance.soporte}</small>
            </header>
            <ul className={styles.planVisualTrustList}>
              {governance.servicio.slice(0, 2).map((item) => (
                <li key={`${plan.key}-srv-${item}`}>{item}</li>
              ))}
            </ul>
          </section>
        </article>
        );
      })}
    </div>
  );
}