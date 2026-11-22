"""Lokal utvecklingsserver utan cache:  python tools/serve.py [port]"""
import http.server, os, sys, functools

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
http.server.ThreadingHTTPServer(("", port), functools.partial(H, directory=root)).serve_forever()
