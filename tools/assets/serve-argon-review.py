"""Local review server, including source candidates excluded from HTML5 builds."""
import http.server
from pathlib import Path
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(Path(__file__).resolve().parents[2]),**kwargs)
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
class Server(http.server.ThreadingHTTPServer):
    request_queue_size=128
    daemon_threads=True
print('Argon review: http://127.0.0.1:3254/docs/argon-assets/review.html',flush=True)
Server(('127.0.0.1',3254),Handler).serve_forever()
