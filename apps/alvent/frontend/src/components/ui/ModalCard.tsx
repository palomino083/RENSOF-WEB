import { ReactNode } from "react";
import styles from "./ui-kit.module.css";

type ModalCardProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function ModalCard({ open, title, subtitle, children, actions }: ModalCardProps) {
  if (!open) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>

        <div className={styles.modalBody}>{children}</div>

        {actions ? <div className={styles.modalActions}>{actions}</div> : null}
      </div>
    </div>
  );
}
