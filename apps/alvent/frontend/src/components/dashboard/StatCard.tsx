type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
}: StatCardProps) {
  return (
    <div className="stat-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h3
          style={{
            fontSize: "15px",
            color: "var(--muted)",
            fontWeight: 600,
          }}
        >
          {title}
        </h3>

        {icon && (
          <span style={{ fontSize: "26px" }}>
            {icon}
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: "30px",
          fontWeight: 700,
          color: "var(--text)",
        }}
      >
        {value}
      </div>

      {subtitle && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "13px",
            color: "var(--muted)",
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}