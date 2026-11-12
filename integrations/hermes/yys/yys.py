#!/usr/bin/env python3
"""yys — Hermes'in YYS (yatakhane yönetim sistemi) istemcisi.

YYS'nin TÜM API'sini ajan anahtarıyla çağırır; hangi ucun ne işe yaradığını YYS'nin kendi kataloğundan bulur.
Yalnız Python standart kitaplığı kullanır. Belge: YYS deposu docs/hermes-entegrasyon.md

  yys kimim                              anahtar hangi kullanıcı/rol adına çalışıyor, sunucu saati
  yys ara su dağıtım                     uç ara (Türkçe ya da yol parçası); --modul water --metot POST --sema
  yys moduller                           modüller ve uç sayıları
  yys uc POST /api/water/distribute      ucun gövde şeması + kaynak kodu
  yys kaynak modules/water/movements.js  backend kaynak dosyası (--grep sözcük, --from 120 --lines 80)
  yys belge [water-module]               modül belgeleri (iş kuralları)
  yys get /api/water/stock tarih=2026-11-01
  yys post /api/water/distribute --json '{"zone_id":3,"product_id":1,"quantity":20}'
  yys post /api/... ad=Ali yas:=30       ad=değer metin, ad:=değer JSON (sayı, true, liste…)
  yys post /api/... --dosya photo=/tmp/a.jpg not=deneme      çok parçalı (multipart) yükleme
  yys get /api/.../pdf --cikti /tmp/a.pdf                    ikili yanıtı dosyaya yaz
  yys kasa                               özel finans kasası: store'lar (yalnız sahip kasa izni verdiyse)
  yys kasa oku finance-storage --yol accounts             store verisi (isteğe bağlı JSON yolu: a.b.0)
  yys kasa gecmis finance-storage                         store'un sürüm geçmişi

Çıkış kodu: 0 başarılı · 1 YYS hata döndü (durum kodu ve mesaj stderr'de) · 2 kullanım/kurulum hatası
"""
import json
import mimetypes
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ENV_FILE = os.path.expanduser(os.environ.get('YYS_ENV_FILE', '~/.hermes/yys.env'))
DEFAULT_URL = 'http://127.0.0.1:3001'
MAX_OUTPUT = 30000
TIMEOUT = 120
ROLE_SHORT = {
    'campus_manager': 'müdür', 'shift_supervisor': 'amir', 'technical': 'teknik',
    'laundry': 'çamaşır', 'housekeeper': 'kat',
}


def die(message, code=2):
    sys.stderr.write(message.rstrip() + '\n')
    sys.exit(code)


def load_config():
    values = {}
    try:
        with open(ENV_FILE, encoding='utf-8') as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, value = line.partition('=')
                values[key.strip()] = value.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    url = os.environ.get('YYS_URL') or values.get('YYS_URL') or DEFAULT_URL
    key = os.environ.get('YYS_AGENT_KEY') or values.get('YYS_AGENT_KEY')
    if not key:
        die('YYS ajan anahtarı yok. %s dosyasına YYS_AGENT_KEY=yysa_… yazın '
            '(anahtar: YYS → Ayarlar → Ajan Anahtarları).' % ENV_FILE)
    return url.rstrip('/'), key


def api_path(path):
    if path.startswith('http://') or path.startswith('https://'):
        die('Tam adres değil, yol verin: /api/…')
    if not path.startswith('/'):
        path = '/' + path
    if not (path == '/api' or path.startswith('/api/')):
        path = '/api' + path
    return path


def multipart(fields, files):
    boundary = '----yys' + uuid.uuid4().hex
    out = []
    for name, value in fields.items():
        text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        out.append(('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (boundary, name, text)).encode())
    for name, file_path in files:
        try:
            with open(file_path, 'rb') as handle:
                data = handle.read()
        except OSError as exc:
            die('Dosya okunamadı: %s (%s)' % (file_path, exc))
        ctype = mimetypes.guess_type(file_path)[0] or 'application/octet-stream'
        head = '--%s\r\nContent-Disposition: form-data; name="%s"; filename="%s"\r\nContent-Type: %s\r\n\r\n' % (
            boundary, name, os.path.basename(file_path).replace('"', ''), ctype)
        out.append(head.encode() + data + b'\r\n')
    out.append(('--%s--\r\n' % boundary).encode())
    return b''.join(out), 'multipart/form-data; boundary=' + boundary


def request(method, path, query=None, body=None, files=None, idem=None):
    """→ (durum, başlıklar, ham gövde). Ağ hatasında aynı işlem anahtarıyla bir kez yeniden dener (bkz. aşağı)."""
    base, key = load_config()
    url = base + api_path(path)
    if query:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(query, doseq=True)
    headers = {'Authorization': 'Bearer ' + key, 'Accept': 'application/json', 'User-Agent': 'yys-hermes/1'}
    data = None
    if files:
        data, headers['Content-Type'] = multipart(body or {}, files)
    elif body is not None:
        data = json.dumps(body, ensure_ascii=False).encode()
        headers['Content-Type'] = 'application/json'
    if method not in ('GET', 'HEAD'):
        headers['X-Idempotency-Key'] = idem or ('hermes-' + uuid.uuid4().hex)
    last = None
    for attempt in (1, 2):
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
                return res.status, res.headers, res.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.headers, exc.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            # Okuma yeniden denenir. Yazma yalnız istek sunucuya HİÇ ulaşmadıysa (bağlantı reddi) denenir:
            # zaman aşımında işlem yapılmış olabilir, körlemesine tekrar çift kayıt açar.
            refused = isinstance(getattr(exc, 'reason', exc), ConnectionRefusedError)
            if attempt == 2 or (method not in ('GET', 'HEAD') and not refused):
                break
            time.sleep(2)
    note = '' if method in ('GET', 'HEAD') else (
        '\nİşlem yapılmış OLABİLİR — yeniden denemeden önce kaydı okuyarak doğrulayın '
        '(aynı işlemi tekrarlayacaksanız --anahtar %s verin).' % headers['X-Idempotency-Key'])
    die('YYS\'ye ulaşılamadı (%s): %s%s' % (base, getattr(last, 'reason', last), note), 1)


def decode(headers, raw):
    ctype = (headers.get('Content-Type') or '').lower()
    if 'json' in ctype:
        try:
            return 'json', json.loads(raw.decode('utf-8'))
        except ValueError:
            pass
    if ctype.startswith('text/') or 'json' in ctype or 'xml' in ctype or 'csv' in ctype:
        return 'text', raw.decode('utf-8', 'replace')
    return 'binary', raw


def error_text(status, kind, payload):
    if kind == 'json' and isinstance(payload, dict):
        message = payload.get('error') or payload.get('message') or json.dumps(payload, ensure_ascii=False)
        extra = ''
        if payload.get('code'):
            extra += ' [%s]' % payload['code']
        if payload.get('details'):
            extra += '\n' + json.dumps(payload['details'], ensure_ascii=False, indent=1)
        hint = {
            401: 'Anahtar geçersiz/iptal edilmiş — YYS → Ayarlar → Ajan Anahtarları.',
            403: 'Bu anahtarın rolü yetmiyor ya da uç ajana kapalı. `yys ara` çıktısındaki rol sütununa bakın.',
            404: 'Uç ya da kayıt yok. Yolu `yys ara` ile doğrulayın.',
            423: 'Kayıt kilitli (ör. su modülünde ay kilidi). Kilidi kullanıcı açmadan zorlamayın.',
            429: 'Çok fazla istek — biraz bekleyip yeniden deneyin.',
        }.get(status, '')
        return 'YYS %s: %s%s%s' % (status, message, extra, ('\n' + hint) if hint else '')
    if kind == 'text':
        return 'YYS %s: %s' % (status, payload[:2000])
    return 'YYS %s' % status


def call(method, path, query=None, body=None, files=None, idem=None):
    status, headers, raw = request(method, path, query, body, files, idem)
    kind, payload = decode(headers, raw)
    if status >= 400:
        die(error_text(status, kind, payload), 1)
    return kind, payload, headers


def emit(kind, payload, headers, out_file=None, full=False):
    if out_file or kind == 'binary':
        raw = payload if kind == 'binary' else (
            json.dumps(payload, ensure_ascii=False, indent=1) if kind == 'json' else payload).encode('utf-8')
        if not out_file:
            ext = mimetypes.guess_extension((headers.get('Content-Type') or '').split(';')[0].strip()) or '.bin'
            handle, out_file = tempfile.mkstemp(prefix='yys-', suffix=ext)
            os.close(handle)
        with open(out_file, 'wb') as handle:
            handle.write(raw)
        print('dosyaya yazıldı: %s (%d bayt, %s)' % (out_file, len(raw), headers.get('Content-Type') or '?'))
        return
    text = json.dumps(payload, ensure_ascii=False, indent=1) if kind == 'json' else payload
    if not full and len(text) > MAX_OUTPUT:
        text = text[:MAX_OUTPUT] + '\n… (%d karakterin ilk %d\'i; tamamı için --tam ya da --cikti dosya, ' \
            'ya da sorguyu daraltın)' % (len(text), MAX_OUTPUT)
    print(text)


def take(args, flag, default=None):
    """--flag değer çiftini listeden çıkarır."""
    if flag not in args:
        return default
    index = args.index(flag)
    if index + 1 >= len(args):
        die('%s bir değer ister' % flag)
    value = args[index + 1]
    del args[index:index + 2]
    return value


def take_all(args, flag):
    values = []
    while flag in args:
        values.append(take(args, flag))
    return values


def take_flag(args, flag):
    if flag in args:
        args.remove(flag)
        return True
    return False


def parse_pairs(items):
    """ad=değer → metin; ad:=değer → JSON."""
    out = {}
    for item in items:
        cut = item.find('=')
        if cut > 1 and item[cut - 1] == ':':
            name, value = item[:cut - 1], item[cut + 1:]
            try:
                out[name] = json.loads(value)
            except ValueError:
                die('Geçersiz JSON değeri: %s' % item)
        elif cut > 0:
            out[item[:cut]] = item[cut + 1:]
        else:
            die('Anlaşılmayan parametre: %s (ad=değer bekleniyor)' % item)
    return out


def cmd_http(method, args):
    if not args:
        die('Yol gerekli: yys %s /api/…' % method.lower())
    out_file = take(args, '--cikti')
    full = take_flag(args, '--tam')
    idem = take(args, '--anahtar')
    raw_json = take(args, '--json')
    files = []
    for spec in take_all(args, '--dosya'):
        if '=' not in spec:
            die('--dosya alan=yol biçiminde olmalı')
        files.append(tuple(spec.split('=', 1)))
    path, pairs = args[0], parse_pairs(args[1:])
    query, body = None, None
    if method in ('GET', 'HEAD'):
        query = {k: v if isinstance(v, (str, list)) else json.dumps(v) for k, v in pairs.items()}
        if raw_json or files:
            die('GET isteğinde --json / --dosya kullanılmaz; sorgu parametrelerini ad=değer yazın')
    else:
        if raw_json is not None:
            if raw_json.startswith('@'):
                try:
                    with open(raw_json[1:], encoding='utf-8') as handle:
                        raw_json = handle.read()
                except OSError as exc:
                    die('JSON dosyası okunamadı: %s' % exc)
            elif raw_json == '-':
                raw_json = sys.stdin.read()
            try:
                body = json.loads(raw_json)
            except ValueError as exc:
                die('--json geçerli JSON değil: %s' % exc)
            if pairs:
                if not isinstance(body, dict):
                    die('--json bir nesne değilken ad=değer eklenemez')
                body.update(pairs)
        elif pairs or not files:
            body = pairs
    kind, payload, headers = call(method, path, query, body, files, idem)
    if headers.get('X-Idempotent-Replay'):
        sys.stderr.write('not: bu işlem daha önce yapılmıştı; kayıtlı yanıt döndü (yeniden uygulanmadı)\n')
    emit(kind, payload, headers, out_file, full)


def cmd_kimim(_args):
    _, who, _ = call('GET', '/api/agent/whoami')
    user, agent = who['user'], who.get('agent') or {}
    print('%s (%s) — rol: %s' % (user.get('full_name') or user['username'], user['username'], user['role']))
    print('anahtar: %s · erişim: %s' % (agent.get('name', '—'), 'okuma + yazma' if agent.get('access') == 'write' else 'yalnız okuma'))
    if agent.get('kasa'):
        print('özel kasa: %s' % ('okuma + yazma' if agent['kasa'] == 'write' else 'yalnız okuma'))
    print('sunucu saati: %s %s (%s)' % (who['local_date'], who['local_time'], who['timezone']))


def cmd_ara(args):
    query = {'limit': take(args, '--limit', '25')}
    module = take(args, '--modul')
    method = take(args, '--metot')
    as_json = take_flag(args, '--json')
    if module:
        query['module'] = module
    if method:
        query['method'] = method
    if take_flag(args, '--sema'):
        query['schema'] = '1'
    if not take_flag(args, '--hepsi'):
        query['only_callable'] = '1'
    query['q'] = ' '.join(args)
    _, result, _ = call('GET', '/api/agent/catalog', query)
    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=1))
        return
    if not result['items']:
        print('Eşleşen uç yok. Başka sözcük deneyin (yollar İngilizce: water, laundry, shifts…) ya da `yys moduller`.')
        return
    for item in result['items']:
        roles = item.get('roles')
        who = ','.join(ROLE_SHORT.get(r, r) for r in roles) if roles else item['access']
        mark = {True: '✓', False: '✗', None: '?'}[item.get('callable')]
        line = '%s %-6s %s  [%s]' % (mark, item['method'], item['path'], who)
        if item.get('has_schema'):
            line += ' {şema}'
        print(line)
        if item.get('description'):
            print('         ' + item['description'])
        if item.get('agent_blocked'):
            print('         ajana kapalı: ' + item['agent_blocked'])
        for schema in item.get('schemas') or []:
            print('         %s: %s' % (schema['in'], json.dumps(schema['schema'], ensure_ascii=False)))
    if result['total'] > result['count']:
        print('… %d uçtan %d\'i gösterildi (--limit N, --modul, --metot ile daraltın)' % (result['total'], result['count']))
    print('Ayrıntı: yys uc <METOT> <yol>')


def cmd_moduller(_args):
    _, modules, _ = call('GET', '/api/agent/modules')
    print('  '.join('%s(%d)' % (m['module'], m['endpoints']) for m in modules))


def cmd_uc(args):
    if len(args) != 2:
        die('Kullanım: yys uc <METOT> <yol>   örn: yys uc POST /api/water/distribute')
    _, detail, _ = call('GET', '/api/agent/catalog/endpoint', {'method': args[0].upper(), 'path': api_path(args[1])})
    print('%s %s' % (detail['method'], detail['path']))
    for schema in detail.get('schemas') or []:
        print('\n%s şeması:\n%s' % (schema['in'], json.dumps(schema['schema'], ensure_ascii=False, indent=1)))
    if detail.get('code'):
        print('\n# backend/src/%s:%s\n%s' % (detail['source'], detail.get('line', '?'), detail['code']))
        print('\nGövde alanları burada görünmüyorsa çağrılan service fonksiyonuna bakın: yys kaynak <dosya> --grep <fonksiyon>')
    else:
        print('\n(kaynak eşleştirilemedi — `yys kaynak modules/<modül>/routes.js --grep "%s"` deneyin)' % args[1].rsplit('/', 1)[-1])


def cmd_kaynak(args):
    query = {}
    for flag, name in (('--grep', 'grep'), ('--from', 'from'), ('--lines', 'lines')):
        value = take(args, flag)
        if value:
            query[name] = value
    if len(args) != 1:
        die('Kullanım: yys kaynak <dosya> [--grep sözcük] [--from N --lines N]   (dosya backend/src\'ye göre)')
    query['file'] = args[0].replace('backend/src/', '')
    _, result, _ = call('GET', '/api/agent/source', query)
    if 'matches' in result:
        for match in result['matches']:
            print('%5d  %s' % (match['line'], match['text']))
        print('(%s — %d satır, %d eşleşme)' % (result['file'], result['total_lines'], len(result['matches'])))
    else:
        print(result['code'])
        print('\n(%s satır %d–%d / %d)' % (result['file'], result['from'], result['to'], result['total_lines']))


def cmd_belge(args):
    if not args:
        _, docs, _ = call('GET', '/api/agent/docs')
        for doc in docs:
            print('%-28s %s' % (doc['name'], doc['title']))
        return
    _, text, _ = call('GET', '/api/agent/docs/' + urllib.parse.quote(args[0]))
    print(text)


def dig(value, path):
    for part in [p for p in path.split('.') if p]:
        if isinstance(value, list):
            try:
                value = value[int(part)]
            except (ValueError, IndexError):
                die('Yol bulunamadı: %s (liste, indeks bekleniyor)' % part, 1)
        elif isinstance(value, dict):
            if part not in value:
                die('Yol bulunamadı: %s (anahtarlar: %s)' % (part, ', '.join(list(value)[:40])), 1)
            value = value[part]
        else:
            die('Yol bulunamadı: %s (değer %s)' % (part, type(value).__name__), 1)
    return value


def kasa_call(path):
    try:
        return call('GET', path)[1]
    except SystemExit as exc:
        if exc.code == 1:
            sys.stderr.write('not: kasa 404 dönüyorsa bu anahtara kasa izni verilmemiştir (izni yalnız sahip verir).\n')
        raise


def cmd_kasa(args):
    # Salt okuma: kasaya yazma kasa-ops (hermes-inbox) üzerinden yapılır; uygulamanın store'unu doğrudan ezme.
    sub = args.pop(0).lower() if args else 'liste'
    if sub in ('liste', 'list'):
        for row in kasa_call('/api/pf/state')['stores']:
            print('%-28s v%-5s %8d bayt  %s  %s' % (row['store_key'], row['version'], row.get('bytes') or 0,
                                                   row.get('updated_at') or '', row.get('actor') or ''))
        return
    if not args:
        die('Kullanım: yys kasa oku|gecmis <store> [--yol a.b] [--tam]')
    store = urllib.parse.quote(args[0], safe='')
    if sub in ('oku', 'read'):
        path, full = take(args, '--yol'), take_flag(args, '--tam')
        row = kasa_call('/api/pf/state/' + store)
        data = dig(row.get('data'), path) if path else row.get('data')
        if not path:
            sys.stderr.write('%s v%s · %s · %s\n' % (row.get('store_key'), row.get('version'), row.get('updated_at'), row.get('actor')))
        text = json.dumps(data, ensure_ascii=False, indent=1)
        if len(text) > MAX_OUTPUT and not full:
            keys = ', '.join(list(data)[:60]) if isinstance(data, dict) else '%d öğe' % len(data) if isinstance(data, list) else ''
            text = text[:MAX_OUTPUT] + '\n… kesildi (%d karakter). Daralt: --yol <anahtar>%s' % (len(text), (' — ' + keys) if keys else '')
        print(text)
    elif sub in ('gecmis', 'history'):
        for row in kasa_call('/api/pf/state/%s/history' % store)['versions']:
            print('v%-5s %s  %8d bayt  %s' % (row['version'], row['saved_at'], row.get('bytes') or 0, row.get('actor') or ''))
    else:
        die('Bilinmeyen kasa komutu: %s (liste | oku | gecmis)' % sub)


COMMANDS = {
    'kasa': cmd_kasa,
    'kimim': cmd_kimim, 'whoami': cmd_kimim,
    'ara': cmd_ara, 'search': cmd_ara,
    'moduller': cmd_moduller, 'modules': cmd_moduller,
    'uc': cmd_uc, 'endpoint': cmd_uc,
    'kaynak': cmd_kaynak, 'source': cmd_kaynak,
    'belge': cmd_belge, 'docs': cmd_belge,
}


def main(argv):
    if not argv or argv[0] in ('-h', '--help', 'yardim', 'help'):
        print(__doc__.strip())
        return
    command, args = argv[0].lower(), list(argv[1:])
    if command in COMMANDS:
        COMMANDS[command](args)
    elif command.upper() in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'):
        cmd_http(command.upper(), args)
    else:
        die('Bilinmeyen komut: %s\n\n%s' % (command, __doc__.strip()))


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except BrokenPipeError:
        pass
    except KeyboardInterrupt:
        sys.exit(130)
