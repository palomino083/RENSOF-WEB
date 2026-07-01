export default function TopProductos({ data }: any) {
  if (!data) return null;

  return (
    <div className="p-4 bg-white shadow rounded-xl">
      <h2 className="font-bold mb-2">Top Productos</h2>

      {data.map((p: any, i: number) => (
        <p key={i}>
          {p.nombre} - {p.cantidad}
        </p>
      ))}
    </div>
  );
}