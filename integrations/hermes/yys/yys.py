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

Özel finans kasası (ayrı anahtar: YYS_PF_KEY) — veri store başına tek JSON bloktur:
  yys kasa                                         store listesi (ad, sürüm, boyut)
  yys kasa oku finance-storage                     yapının özeti (anahtarlar, dizi boyları, örnek öğe)
  yys kasa oku finance-storage state.transactions.-1        tek değer (-1 = son öğe; id=abc = id'si abc olan)
  yys kasa oku finance-storage state.transactions --son 5   dizinin son 5 öğesi
  yys kasa ekle finance-storage state.transactions --json '{…}'   diziye öğe ekle
  yys kasa yaz  finance-storage state.transactions.id=abc.amount --json 250   değeri değiştir
  yys kasa sil  finance-storage state.transactions.id=abc   öğeyi/alanı sil
  yys kasa gecmis finance-storage                  eski sürümler
  yys kasa geri finance-storage 41                 41. sürüme dön

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


CONFIG = {}


def load_config(need_key=True):
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
    CONFIG.update(values)
    url = os.environ.get('YYS_URL') or values.get('YYS_URL') or DEFAULT_URL
    key = os.environ.get('YYS_AGENT_KEY') or values.get('YYS_AGENT_KEY')
    if not key and need_key:
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


def pf_request(method, path, body=None):
    """Özel finans kasası — ajan anahtarı DEĞİL, kasanın kendi anahtarı (X-PF-Key) gider."""
    base, _ = load_config(need_key=False)
    key = os.environ.get('YYS_PF_KEY') or CONFIG.get('YYS_PF_KEY')
    if not key:
        die('Kasa anahtarı yok. %s dosyasına YYS_PF_KEY=… yazın (sunucuda: backend/scripts/pf-key.mjs '
            'create hermes read,write,restore).' % ENV_FILE)
    headers = {'X-PF-Key': key, 'Accept': 'application/json', 'User-Agent': 'yys-hermes/1'}
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + '/api/pf' + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return res.status, json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode('utf-8'))
        except ValueError:
            payload = {}
        return exc.code, payload
    except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
        die('YYS\'ye ulaşılamadı (%s): %s' % (base, getattr(exc, 'reason', exc)), 1)


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


# ── Özel finans kasası ────────────────────────────────────────────────────────────────────────────
def pf_fail(status, payload, what):
    hint = {
        404: 'Kasa anahtarı geçersiz/iptal, bu işlem için kapsamı yetmiyor ya da store/sürüm yok.',
        409: 'Başka bir cihaz aynı anda yazdı (sürüm çakışması).',
        413: 'Veri çok büyük.',
    }.get(status, '')
    die('Kasa %s: %s — %s%s' % (status, what, payload.get('error') or '?', ('\n' + hint) if hint else ''), 1)


def pf_get(store):
    status, payload = pf_request('GET', '/state/' + urllib.parse.quote(store))
    if status != 200:
        pf_fail(status, payload, store)
    return payload


def path_parts(path):
    return [p for p in (path or '').split('.') if p != '']


def step(node, part, where):
    """Bir yol parçasını çözer → (kap, anahtar). Dizi: sayı (-1 = son) ya da alan=değer (ör. id=abc)."""
    if isinstance(node, list):
        if '=' in part:
            field, value = part.split('=', 1)
            hits = [i for i, item in enumerate(node) if isinstance(item, dict) and str(item.get(field)) == value]
            if len(hits) != 1:
                die('%s: %s=%s için %d eşleşme (tam 1 olmalı)' % (where, field, value, len(hits)), 1)
            return node, hits[0]
        try:
            index = int(part)
        except ValueError:
            die('%s bir dizi; sayı ya da alan=değer bekleniyor, gelen: %s' % (where, part), 1)
        if not -len(node) <= index < len(node):
            die('%s: %d. öğe yok (dizi boyu %d)' % (where, index, len(node)), 1)
        return node, index % len(node)
    if isinstance(node, dict):
        return node, part
    die('%s bir %s; altına inilemez (%s)' % (where, type(node).__name__, part), 1)


def resolve(data, parts):
    node, seen = data, []
    for part in parts:
        box, key = step(node, part, '.'.join(seen) or '(kök)')
        if isinstance(box, dict) and key not in box:
            die('Yol yok: %s (burada olanlar: %s)' % ('.'.join(seen + [part]), ', '.join(list(box)[:40])), 1)
        node = box[key]
        seen.append(part)
    return node


def shape(value, depth=0):
    """Büyük blokun özeti: anahtarlar, dizi boyları, dizilerden bir örnek öğe."""
    if isinstance(value, dict):
        if depth >= 3:
            return '{…%d alan}' % len(value)
        return {k: shape(v, depth + 1) for k, v in value.items()}
    if isinstance(value, list):
        out = {'_dizi': len(value)}
        if value:
            out['_son_öğe'] = shape(value[-1], depth + 1)
        return out
    if isinstance(value, str) and len(value) > 80:
        return value[:80] + '…'
    return value


def pf_mutate(store, change, what):
    """Oku → değiştir → sürümle yaz. Çakışmada (409) taze veriyle baştan uygular; körlemesine ezmez."""
    for _ in range(3):
        current = pf_get(store)
        data = current['data']
        note = change(data)
        status, payload = pf_request('PUT', '/state/' + urllib.parse.quote(store),
                                     {'data': data, 'base_version': current['version'], 'device_id': 'hermes'})
        if status in (200, 201):
            if payload.get('unchanged'):
                print('değişiklik yok (veri zaten böyle) — sürüm %s' % payload['version'])
            else:
                print('%s — %s sürüm %s → %s' % (note or what, store, current['version'], payload['version']))
                print('geri almak için: yys kasa geri %s %s' % (store, current['version']))
            return
        if status != 409:
            pf_fail(status, payload, what)
    die('Kasa: %s üç denemede de sürüm çakışması verdi; biraz sonra yeniden deneyin.' % store, 1)


def json_arg(args):
    raw = take(args, '--json')
    if raw is None:
        die('--json değeri gerekli')
    if raw.startswith('@'):
        with open(raw[1:], encoding='utf-8') as handle:
            raw = handle.read()
    elif raw == '-':
        raw = sys.stdin.read()
    try:
        return json.loads(raw)
    except ValueError as exc:
        die('--json geçerli JSON değil: %s' % exc)


def cmd_kasa(args):
    action = args.pop(0).lower() if args else 'liste'
    if action in ('liste', 'list'):
        status, payload = pf_request('GET', '/state')
        if status != 200:
            pf_fail(status, payload, 'liste')
        for row in payload['stores']:
            print('%-28s sürüm %-5s %8d bayt  %s  %s' % (row['store_key'], row['version'], row['bytes'],
                                                        row['updated_at'], row.get('actor') or ''))
        if not payload['stores']:
            print('Kasada henüz veri yok.')
        return
    if not args:
        die('Kullanım: yys kasa %s <store> …   (store adları: yys kasa)' % action)
    store = args.pop(0)
    if action in ('oku', 'get'):
        last = take(args, '--son')
        full = take_flag(args, '--tam')
        current = pf_get(store)
        value = resolve(current['data'], path_parts(args[0] if args else ''))
        if last is not None:
            if not isinstance(value, list):
                die('--son yalnız dizide kullanılır', 1)
            value = value[-int(last):]
        text = json.dumps(value, ensure_ascii=False, indent=1)
        if not full and len(text) > 6000 and last is None:
            print('# %s sürüm %s — büyük (%d karakter); yapı özeti (tamamı: --tam, dizinin sonu: --son N):'
                  % (store, current['version'], len(text)))
            text = json.dumps(shape(value), ensure_ascii=False, indent=1)
        else:
            print('# %s sürüm %s' % (store, current['version']))
        print(text if full or len(text) <= MAX_OUTPUT else text[:MAX_OUTPUT] + '\n… (kesildi; yolu daraltın)')
    elif action in ('ekle', 'add'):
        value = json_arg(args)
        if not args:
            die('Kullanım: yys kasa ekle <store> <dizi yolu> --json \'{…}\'')
        parts = path_parts(args[0])

        def change(data):
            target = resolve(data, parts)
            if not isinstance(target, list):
                die('%s bir dizi değil; `yaz` kullanın' % args[0], 1)
            if target and isinstance(target[-1], dict) and isinstance(value, dict):
                missing = sorted(set(target[-1]) - set(value))
                if missing:
                    sys.stderr.write('uyarı: son öğede olup yenisinde olmayan alanlar: %s\n' % ', '.join(missing))
            target.append(value)
            return 'eklendi (%s artık %d öğe)' % (args[0], len(target))
        pf_mutate(store, change, 'ekleme')
    elif action in ('yaz', 'set'):
        value = json_arg(args)
        if not args or not path_parts(args[0]):
            die('Kullanım: yys kasa yaz <store> <yol> --json <değer>   (kökün tamamı ezilmez; bir yol verin)')
        parts = path_parts(args[0])

        def change(data):
            box, key = step(resolve(data, parts[:-1]), parts[-1], '.'.join(parts[:-1]) or '(kök)')
            old = box.get(key) if isinstance(box, dict) else box[key]
            box[key] = value
            return 'yazıldı %s: %s → %s' % (args[0], json.dumps(old, ensure_ascii=False)[:120],
                                           json.dumps(value, ensure_ascii=False)[:120])
        pf_mutate(store, change, 'yazma')
    elif action in ('sil', 'delete'):
        if not args or not path_parts(args[0]):
            die('Kullanım: yys kasa sil <store> <yol>')
        parts = path_parts(args[0])

        def change(data):
            box, key = step(resolve(data, parts[:-1]), parts[-1], '.'.join(parts[:-1]) or '(kök)')
            if isinstance(box, dict) and key not in box:
                die('Yol yok: %s' % args[0], 1)
            old = box.pop(key)
            return 'silindi %s: %s' % (args[0], json.dumps(old, ensure_ascii=False)[:200])
        pf_mutate(store, change, 'silme')
    elif action in ('gecmis', 'history'):
        status, payload = pf_request('GET', '/state/%s/history' % urllib.parse.quote(store))
        if status != 200:
            pf_fail(status, payload, 'geçmiş')
        for row in payload['versions']:
            print('sürüm %-5s %s  %8d bayt  %s' % (row['version'], row['saved_at'], row['bytes'], row.get('actor') or ''))
        if not payload['versions']:
            print('Geçmiş sürüm yok.')
    elif action in ('geri', 'restore'):
        if len(args) != 1 or not args[0].isdigit():
            die('Kullanım: yys kasa geri <store> <sürüm>   (sürümler: yys kasa gecmis <store>)')
        status, payload = pf_request('POST', '/state/%s/restore' % urllib.parse.quote(store), {'version': int(args[0])})
        if status != 200:
            pf_fail(status, payload, 'geri yükleme')
        print('%s sürüm %s içeriğine döndü (yeni sürüm %s)' % (store, args[0], payload['version']))
    else:
        die('Bilinmeyen kasa komutu: %s (liste, oku, ekle, yaz, sil, gecmis, geri)' % action)


COMMANDS = {
    'kimim': cmd_kimim, 'whoami': cmd_kimim,
    'ara': cmd_ara, 'search': cmd_ara,
    'moduller': cmd_moduller, 'modules': cmd_moduller,
    'uc': cmd_uc, 'endpoint': cmd_uc,
    'kaynak': cmd_kaynak, 'source': cmd_kaynak,
    'belge': cmd_belge, 'docs': cmd_belge,
    'kasa': cmd_kasa,
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
