"""
Сквозной тест на локальном макете страницы проверки УИН (без доступа к интернету).
Запуск:  python -m pytest tests  или  python tests/test_mock_site.py
"""
import json
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import dmdk_checker as dc  # noqa: E402

DB = {
    "6433000000000001": {"status": "В обороте", "metal": "Золото", "probe": "585", "weight": "2.15"},
    "6433000000000002": {"status": "Реализовано (розничная продажа)", "metal": "Серебро", "probe": "925"},
    "6433000000000003": {"status": "Выведено из оборота", "metal": "Золото", "probe": "750"},
}

PAGE = """<!doctype html><html><head><meta charset=utf-8><title>Проверка УИН</title></head>
<body><h1>Проверка ювелирного изделия</h1>
<form id=f><input type=text placeholder="Введите УИН" id=uin><button type=submit>Проверить</button></form>
<div id=out></div>
<script>
document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  const r = await fetch('/api/check?uin=' + document.getElementById('uin').value);
  const d = await r.json();
  const out = document.getElementById('out');
  if (!d.found) { out.innerText = 'Изделие с таким УИН не найдено'; return; }
  out.innerText = 'Статус: ' + d.item.status + '\\nМеталл: ' + d.item.metal + '\\nПроба: ' + d.item.probe;
};
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/api/check"):
            uin = self.path.split("uin=")[-1]
            item = DB.get(uin)
            body = json.dumps({"uin": uin, "found": bool(item), "item": item}, ensure_ascii=False)
            ctype = "application/json; charset=utf-8"
        else:
            body, ctype = PAGE, "text/html; charset=utf-8"
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def test_mock_site():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "uins.txt"
            src.write_text("6433 0000 0000 0001\n6433000000000002; 6433000000000003\n6433000000000099\nмусор\n")
            uins = dc.read_uins(src)
            assert uins == ["6433000000000001", "6433000000000002", "6433000000000003", "6433000000000099"]
            out = Path(tmp) / "res.xlsx"
            res = dc.run(uins, out, url=url, delay=0.1, retries=0, timeout=10, log=print)
            got = {r.uin: r.status for r in res}
            assert got == {
                "6433000000000001": dc.STATUS_IN_CIRCULATION,
                "6433000000000002": dc.STATUS_SOLD,
                "6433000000000003": dc.STATUS_WITHDRAWN,
                "6433000000000099": dc.STATUS_NOT_FOUND,
            }, got
            assert res[0].details.get("item.probe") == "585"
            assert out.exists() and out.with_suffix(".csv").exists()
            # Повторный запуск берёт результаты из CSV и в браузер не ходит.
            again = dc.run(uins, out, url="http://127.0.0.1:1/", log=print)
            assert [r.status for r in again] == [r.status for r in res], ([r.status for r in again], [r.status for r in res])
    finally:
        server.shutdown()


if __name__ == "__main__":
    test_mock_site()
    print("OK")
