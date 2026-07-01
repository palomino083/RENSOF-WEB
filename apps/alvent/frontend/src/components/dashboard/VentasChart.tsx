export default function VentasChart({ data }: any) {
  if (!data) return null;

  return (
    <div className="p-4 bg-white shadow rounded-xl">
      <h2 className="font-bold mb-2">Ventas</h2>

      <ul>
        {data.map((d: any, i: number) => (
          <li key={i}>
            {d.fecha} → S/ {d.ventas}
          </li>
        ))}
      </ul>
    </div>
  );
}