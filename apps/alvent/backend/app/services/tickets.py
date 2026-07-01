from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from io import BytesIO


def generar_ticket(venta, detalles):

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)

    y = 750

    c.setFont("Helvetica-Bold", 14)
    c.drawString(200, y, "ALVENT POS - TICKET")
    y -= 40

    c.setFont("Helvetica", 10)
    c.drawString(50, y, f"Venta ID: {venta.id}")
    y -= 20
    c.drawString(50, y, f"Total: S/ {venta.total}")
    y -= 20
    c.drawString(50, y, "-----------------------------")
    y -= 20

    for d in detalles:
        c.drawString(50, y, f"{d.cantidad} x {d.producto.nombre} - S/ {d.subtotal}")
        y -= 15

    c.drawString(50, y-20, "Gracias por su compra")

    c.save()
    buffer.seek(0)

    return buffer