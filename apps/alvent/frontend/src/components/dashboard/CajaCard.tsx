export default function CajaCard({ data }: any) {
  if (!data) return null;

  return (
    <div className="p-4 bg-white shadow rounded-xl">
      <h2 className="font-bold">Caja</h2>

      <p>Estado: {data.estado}</p>
      <p>Ingresos: {data.ingresos}</p>
      <p>Egresos: {data.egresos}</p>
      <p>Saldo: {data.saldo_actual}</p>
    </div>
  );
}