"""Build a source-only installer ZIP; never include publisher keys or vendor files."""
import base64,json,pathlib,zipfile
root=pathlib.Path(__file__).resolve().parents[1]
v=json.loads((root/'package.json').read_text())['version']
out=root/'dist';out.mkdir(exist_ok=True)
allowed=['bootstrap','src','scripts','tests','examples','.github','release','signed-release']
files=[]
for name in allowed:
    files.extend(p for p in (root/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.asar'))
files.extend(root/n for n in ['build.py','Install.ps1','Apply.cmd','Restore.cmd','README.md','RELEASE-NOTES.md','RELEASE-NOTES-0.3.0.md','UPDATING.md','ADDON-API.md','STREAMDECK.md','TEST-RESULTS.md','LICENSE','package.json','.gitignore'])
with zipfile.ZipFile(out/f'MasterHUB-Community-{v}-source-installer.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(files):
        name='MasterHUB-Community/'+str(p.relative_to(root))
        if p.name.endswith('.webm.b64'):z.writestr(name[:-4],base64.b64decode(p.read_text().strip(),validate=True))
        else:z.write(p,name)
print('Source installer ready; no vendor archive or signing key included.')
