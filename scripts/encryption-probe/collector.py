#!/usr/bin/env python3
"""Serve probe.html on 127.0.0.1:PORT and write the first POST /result body to OUT, then exit. Nothing else is served."""
import http.server, sys, os, threading
port, out = int(sys.argv[1]), sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.split('?')[0] in ('/', '/probe.html'):
            body = open(os.path.join(here, 'probe.html'), 'rb').read()
            self.send_response(200); self.send_header('content-type', 'text/html'); self.send_header('content-length', str(len(body))); self.end_headers(); self.wfile.write(body)
        else:
            self.send_response(404); self.end_headers()
    def do_POST(self):
        if self.path != '/result': self.send_response(404); self.end_headers(); return
        data = self.rfile.read(int(self.headers.get('content-length', 0)))
        open(out, 'wb').write(data)
        self.send_response(204); self.end_headers()
        threading.Thread(target=self.server.shutdown, daemon=True).start()
srv = http.server.HTTPServer(('127.0.0.1', port), H)
srv.serve_forever()
