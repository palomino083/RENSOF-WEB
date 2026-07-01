import styles from "./ui-kit.module.css";

type StatusBadgeProps = {
  text: string;
  variant?: "success" | "danger" | "warning" | "info" | "neutral";
};

export default function StatusBadge({ text, variant = "neutral" }: StatusBadgeProps) {
  return <span className={`${styles.badge} ${styles[variant]}`}>{text}</span>;
}
