export default function ResumenGeneral({ data }: any) {
  if (!data) return null;

  return (
    <div className="p-4 bg-white shadow rounded-xl">
      <h2 className="font-bold mb-2">Resumen General</h2>

      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}