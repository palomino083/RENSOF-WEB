import { jsPDF } from "jspdf";

export type ComprobantePdfItem = {
  nombre: string;
  cantidad: number;
  precio: number;
};

export type ComprobantePdfData = {
  tipoComprobante: "BOLETA" | "FACTURA";
  ventaId: number | null;
  fechaIso: string;
  negocioNombre: string;
  negocioLogoUrl?: string | null;
  clienteNombre?: string;
  clienteDocumento?: string;
  metodoPago: string;
  subtotal: number;
  descuento: number;
  total: number;
  items: ComprobantePdfItem[];
};

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generarComprobantePdfBlob(data: ComprobantePdfData): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  let y = 16;

  if (data.negocioLogoUrl) {
    const logoDataUrl = await imageUrlToDataUrl(data.negocioLogoUrl);
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", 14, y - 2, 24, 24);
      } catch {
        // Ignorar errores de formato de imagen y continuar con el PDF.
      }
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.negocioNombre || "ALVENT ERP", 42, y + 5);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.tipoComprobante} ELECTRONICA`, 42, y + 12);

  y = 44;
  doc.setDrawColor(190, 190, 190);
  doc.line(14, y, pageWidth - 14, y);

  y += 8;
  doc.setFontSize(10);
  const fechaLocal = new Date(data.fechaIso).toLocaleString("es-PE");
  doc.text(`Fecha: ${fechaLocal}`, 14, y);
  doc.text(`Operacion: ${data.ventaId ?? "PENDIENTE"}`, pageWidth - 70, y);

  y += 7;
  doc.text(`Cliente: ${data.clienteNombre || "Consumidor Final"}`, 14, y);
  doc.text(`Doc: ${data.clienteDocumento || "-"}`, pageWidth - 70, y);

  y += 7;
  doc.text(`Metodo de pago: ${data.metodoPago}`, 14, y);

  y += 8;
  doc.setFillColor(245, 247, 250);
  doc.rect(14, y - 5, pageWidth - 28, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.text("Producto", 16, y);
  doc.text("Cant.", 120, y);
  doc.text("Precio", 145, y);
  doc.text("Subtotal", 170, y);

  y += 6;
  doc.setFont("helvetica", "normal");

  for (const item of data.items) {
    const subtotalItem = item.cantidad * item.precio;
    doc.text(item.nombre.slice(0, 44), 16, y);
    doc.text(String(item.cantidad), 122, y);
    doc.text(`S/${item.precio.toFixed(2)}`, 145, y);
    doc.text(`S/${subtotalItem.toFixed(2)}`, 170, y);
    y += 6;

    if (y > 250) {
      doc.addPage();
      y = 18;
    }
  }

  y += 4;
  doc.line(130, y, pageWidth - 14, y);
  y += 6;

  doc.text(`Subtotal: S/${data.subtotal.toFixed(2)}`, 140, y);
  y += 6;
  doc.text(`Descuento: S/${(data.descuento || 0).toFixed(2)}`, 140, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL: S/${data.total.toFixed(2)}`, 140, y);

  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Gracias por su compra.", 14, y);
  doc.text("Comprobante generado por ALVENT ERP POS.", 14, y + 5);

  return doc.output("blob");
}
