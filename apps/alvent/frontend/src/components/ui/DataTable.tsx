import { ReactNode } from "react";
import styles from "./ui-kit.module.css";

type DataTableProps = {
  headers: string[];
  children: ReactNode;
  minWidth?: number;
  className?: string;
  density?: "compact" | "comfy" | "executive";
};

const densityClassMap = {
  compact: "tableCompact",
  comfy: "tableComfy",
  executive: "tableExecutive",
} as const;

export default function DataTable({
  headers,
  children,
  minWidth = 760,
  className,
  density = "comfy",
}: DataTableProps) {
  const densityClass = styles[densityClassMap[density]];

  return (
    <div className={`${styles.tableWrap} ${className || ""}`}>
      <table className={`${styles.table} ${densityClass}`} style={{ minWidth }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
