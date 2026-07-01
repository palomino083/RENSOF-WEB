export default function AlertasPanel({ data }: any) {
  if (!data) return null;

  return (
    <div className="p-4 bg-white shadow rounded-xl">
      <h2 className="font-bold mb-2">Alertas</h2>

      {data.map((a: any, i: number) => (
        <p key={i}>
          ⚠ {a.tipo}: {a.mensaje}
        </p>
      ))}
    </div>
  );
}