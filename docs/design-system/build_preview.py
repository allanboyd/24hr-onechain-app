"""Build preview.html from preview.template.html + tokens.json (tokens are defined once, in tokens.json)."""
import json, re, pathlib
here = pathlib.Path(__file__).parent
T = json.loads((here / 'tokens.json').read_text())
ref = lambda v: re.sub(r'\{(\w+)\.(\w+)\}', lambda m: T['color'][m[1]][m[2]], v)
def theme(mode): return ''.join(f'--{k}:{ref(v)};' for k, v in T['theme'][mode].items())
fs = T['font']['style']; fam = T['font']['family']
base = [f'--brand-{k}:{v["value"]};' for k, v in T['color']['brand'].items()]
base += [f'--s-{k.replace(".", "_")}:{v}px;' for k, v in T['space'].items()]
base += [f'--r-{k}:{v}px;' for k, v in T['radius'].items()]
base += [f'--m-{k}:{v};' for k, v in T['motion'].items()]
base += [f'--brandRibbon:{T["gradient"]["brandRibbon"]["value"]};',
         f'--ff-display:"{fam["display"]}",system-ui,sans-serif;', f'--ff-body:"{fam["body"]}",system-ui,sans-serif;']
base += [f'--font-{k}:{v["weight"]} {v["size"]}px/{v["lineHeight"]}px "{fam[v["family"]]}",system-ui,sans-serif;' for k, v in fs.items() if 'size' in v]
css = (':root{' + ''.join(base) + theme('light') + '}\n'
       '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){' + theme('dark') + '}}\n'
       ':root[data-theme="dark"]{' + theme('dark') + '}')
scales = {k: T['color'][k] for k in ('navy', 'orange', 'neutral')}
html = (here / 'preview.template.html').read_text().replace('/*TOKENS*/', css).replace('/*SCALES*/', json.dumps(scales))
(here / 'preview.html').write_text(html)
print('wrote preview.html')
