---
'@pkishorez/devtools': patch
---

`devtools snapshot --all` draws every Laymos Project under the current folder that the commits changed, one PNG per Project in `--out-dir`, skipping `fixtures/` and git-ignored folders; it cannot be combined with `--project`, `--out`, or `--title`. `--theme both` writes a `-dark` and a `-light` picture. The JSON summary now names the Project and lists its pictures under `images`, and all pictures of one run share one browser.
