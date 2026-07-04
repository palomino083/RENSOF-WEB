from http.server import BaseHTTPRequestHandler, HTTPServer
import json


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length).decode("utf-8") if length else ""
        try:
            payload = json.loads(raw_body) if raw_body else {}
        except Exception:
            payload = {}

        serie = str(payload.get("serie") or "B001")
        numero = str(payload.get("numero") or "1")
        tipo = str(payload.get("tipo_de_comprobante") or "2")

        response = {
            "aceptada_por_sunat": True,
            "sunat_responsecode": "0",
            "sunat_description": "Comprobante aceptado (mock)",
            "cadena_para_codigo_qr": f"QR-{serie}-{numero}",
            "enlace_del_pdf": f"http://127.0.0.1:8999/pdf/{serie}-{numero}.pdf",
            "enlace_del_xml": f"http://127.0.0.1:8999/xml/{serie}-{numero}.xml",
            "enlace_del_cdr": f"http://127.0.0.1:8999/cdr/{serie}-{numero}.zip",
            "tipo": tipo,
        }

        body = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8999), Handler)
    print("MOCK SUNAT activo en http://127.0.0.1:8999")
    server.serve_forever()
