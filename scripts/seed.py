"""Seed a first user slot from the signed installer release (verified again by bootstrap)."""
import base64,gzip,hashlib,json,pathlib,re,shutil,sys
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
if (out/'current').exists():
    print('Existing community slot preserved; updates are handled in-app.')
    sys.exit(0)
if any((out/n).exists() for n in ('previous','pending','activation.json')):
    raise SystemExit('Interrupted update found. Start the existing installation to recover before reinstalling.')
raw=(root/'release/masterhub-release.json').read_bytes();sig=(root/'release/masterhub-release.sig').read_bytes();blob=(root/'release/masterhub-community.json.gz').read_bytes();m=json.loads(raw)
if len(blob)!=m['bytes'] or hashlib.sha256(blob).hexdigest()!=m['sha256']:raise SystemExit('Installer bundle checksum failed')
data=json.loads(gzip.decompress(blob))['files']
if set(data)!=set(m['files']):raise SystemExit('Installer file list differs')
files={}
for name,f in m['files'].items():
    if not re.fullmatch(r'dng/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*',name):raise SystemExit('Invalid release path')
    b=base64.b64decode(data[name],validate=True)
    if len(b)!=f['bytes'] or hashlib.sha256(b).hexdigest()!=f['sha256']:raise SystemExit('Installer file checksum failed')
    files[name]=b
slot=out/'pending';slot.mkdir()
try:
    for name,b in files.items():
        p=slot/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
    (slot/'release.json').write_bytes(raw);(slot/'release.sig').write_bytes(sig)
    slot.rename(out/'current')
except BaseException:
    shutil.rmtree(slot,ignore_errors=True);raise
print('Initial community release installed; publisher signature checked at launch.')
