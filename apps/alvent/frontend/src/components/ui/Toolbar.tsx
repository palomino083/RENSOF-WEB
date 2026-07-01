import { ReactNode } from "react";
import styles from "./ui-kit.module.css";

type ToolbarProps = {
  title: string;
  right?: ReactNode;
  className?: string;
};

export default function Toolbar({ title, right, className }: ToolbarProps) {
  return (
    <div className={`${styles.toolbar} ${styles.uiEnter} ${className || ""}`} data-stagger="2">
      <h2 className={styles.toolbarTitle}>{title}</h2>
      {right}
    </div>
  );
}
