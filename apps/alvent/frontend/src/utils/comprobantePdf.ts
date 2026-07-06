export type ComprobanteHtmlItem = {
  nombre: string;
  cantidad: number;
  precio: number;
};

export type ComprobanteHtmlData = {
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
  items: ComprobanteHtmlItem[];
};

const escapeHtml = (value: string | number | boolean | null | undefined) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value: number) => `S/${Number(value || 0).toFixed(2)}`;

export function generarComprobanteHtml(data: ComprobanteHtmlData): string {
  const fechaLocal = new Date(data.fechaIso).toLocaleString("es-PE");
  const empresa = String(data.negocioNombre || "ALVENT ERP").trim() || "ALVENT ERP";
  const cliente = data.clienteNombre || "Consumidor Final";
  const documento = data.clienteDocumento || "-";
  const operacion = data.ventaId ?? "PENDIENTE";

  const itemsRows = data.items
    .map((item) => {
      const subtotalItem = Number(item.cantidad || 0) * Number(item.precio || 0);
      return `
        <tr>
          <td>${escapeHtml(item.nombre)}</td>
          <td>${escapeHtml(item.cantidad)}</td>
          <td>${escapeHtml(formatMoney(item.precio))}</td>
          <td>${escapeHtml(formatMoney(subtotalItem))}</td>
        </tr>
      `;
    })
    .join("");

  const logoHtml = data.negocioLogoUrl
    ? `<img src="${escapeHtml(data.negocioLogoUrl)}" alt="Logo" class="logo" />`
    : "";

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(data.tipoComprobante)}_${escapeHtml(String(operacion))}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
          .wrap { max-width: 820px; margin: 0 auto; }
          .head { display: flex; gap: 14px; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 12px; }
          .logo { width: 64px; height: 64px; object-fit: contain; border-radius: 10px; border: 1px solid #e2e8f0; }
          h1 { margin: 0 0 4px; font-size: 20px; }
          .muted { color: #475569; font-size: 12px; margin: 0; }
          .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; margin: 12px 0; font-size: 13px; }
          .meta p { margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background: #e2e8f0; }
          .totals { margin-top: 12px; display: grid; justify-content: end; gap: 4px; font-size: 13px; }
          .totals strong { font-size: 14px; }
          .foot { margin-top: 16px; color: #64748b; font-size: 11px; }
          @media print {
            body { padding: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <header class="head">
            ${logoHtml}
            <div>
              <h1>${escapeHtml(empresa)}</h1>
              <p class="muted">${escapeHtml(data.tipoComprobante)} ELECTRONICA</p>
            </div>
          </header>

          <section class="meta">
            <p><strong>Fecha:</strong> ${escapeHtml(fechaLocal)}</p>
            <p><strong>Operación:</strong> ${escapeHtml(String(operacion))}</p>
            <p><strong>Cliente:</strong> ${escapeHtml(cliente)}</p>
            <p><strong>Doc:</strong> ${escapeHtml(documento)}</p>
            <p><strong>Método de pago:</strong> ${escapeHtml(data.metodoPago)}</p>
          </section>

          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows || `<tr><td colspan="4">Sin items</td></tr>`}
            </tbody>
          </table>

          <section class="totals">
            <p>Subtotal: ${escapeHtml(formatMoney(data.subtotal))}</p>
            <p>Descuento: ${escapeHtml(formatMoney(data.descuento || 0))}</p>
            <p><strong>TOTAL: ${escapeHtml(formatMoney(data.total))}</strong></p>
          </section>

          <p class="foot">Comprobante generado por ${escapeHtml(empresa)}.</p>
        </div>
      </body>
    </html>
  `;
}

export function imprimirComprobanteHtml(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = frameWindow?.document;

  if (!frameWindow || !frameDocument) {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
    throw new Error("No se pudo abrir la vista de impresion del comprobante.");
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  const runPrint = () => {
    frameWindow.focus();
    frameWindow.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1000);
  };

  if (frameDocument.readyState === "complete") {
    runPrint();
  } else {
    iframe.onload = runPrint;
  }
}
