import StatCard from "./StatCard";

type KPIData = {
  productos: number;
  clientes: number;
  usuarios: number;
  ventas: number;
  monto_vendido: number;
  caja_abierta: boolean;
};

interface Props {
  data: KPIData;
}

export default function KPIGrid({ data }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">

      <StatCard
        title="Ventas"
        value={data.ventas}
        icon="💵"
      />

      <StatCard
        title="Productos"
        value={data.productos}
        icon="📦"
      />

      <StatCard
        title="Clientes"
        value={data.clientes}
        icon="👥"
      />

      <StatCard
        title="Usuarios"
        value={data.usuarios}
        icon="👤"
      />

      <StatCard
        title="Monto Vendido"
        value={`S/ ${data.monto_vendido.toLocaleString("es-PE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        icon="💰"
      />

      <StatCard
        title="Caja"
        value={data.caja_abierta ? "ABIERTA" : "CERRADA"}
        icon={data.caja_abierta ? "🟢" : "🔴"}
      />

    </div>
  );
}