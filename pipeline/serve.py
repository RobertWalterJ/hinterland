"""Serve the app locally and open it in a browser.

The app is static, but it fetches its data with fetch(), which browsers refuse
to do from a file:// page. So it needs a server - a small one, bound to
localhost only, serving one folder and nothing else.

Run:  python pipeline/serve.py            # pick a free port, open a browser
      python pipeline/serve.py --port 8731 --no-open
"""
import os
import socket
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app")

DEFAULT_PORT = 8731


class Server(ThreadingHTTPServer):
    """Python's default listen backlog is 5, which a browser blows straight
    through: the app asks for eight data files at once and the offline cache
    later asks for nineteen more, and the overflow arrives as
    ERR_CONNECTION_RESET rather than a queued request."""

    request_queue_size = 128
    daemon_threads = True
    allow_reuse_address = True


class Handler(SimpleHTTPRequestHandler):
    """Adds the couple of media types Windows does not register, and keeps the
    browser from caching a stale build during development."""

    # HTTP/1.1 so connections are kept alive. On 1.0, which is the default
    # here, every file costs a fresh TCP connection and a page load becomes a
    # burst of two dozen of them.
    protocol_version = "HTTP/1.1"

    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        ".json": "application/json",
        ".geojson": "application/geo+json",
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".svg": "image/svg+xml",
    })

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Referrer-Policy", "no-referrer")
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, fmt, *args):
        # Only complain about failures; a log line per JSON file is noise.
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("  %s %s\n" % (args[1], args[0]))


def free_port(preferred):
    for port in [preferred] + list(range(preferred + 1, preferred + 40)):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return 0


def main(argv):
    port = DEFAULT_PORT
    if "--port" in argv:
        port = int(argv[argv.index("--port") + 1])
    port = free_port(port)

    if not os.path.exists(os.path.join(APP, "data", "geo.json")):
        print("The app has no data yet. Run, in order:")
        print("   python pipeline/fetch.py")
        print("   python pipeline/build.py")
        print("   python pipeline/boundaries.py")
        print("   python pipeline/export_web.py")
        return 1

    handler = partial(Handler, directory=APP)
    httpd = Server(("127.0.0.1", port), handler)
    url = "http://127.0.0.1:%d/index.html" % port

    print("Hinterland")
    print("  serving %s" % APP)
    print("  at      %s" % url)
    print("  bound to localhost only - nothing is exposed to the network")
    print("\n  Close this window to stop the app.\n")

    if "--no-open" not in argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
