---
'laymos': patch
'@pkishorez/effect-tracer': patch
'std-toolkit': patch
'use-effect-ts': patch
---

Pin the `effect` peer dependency (and other registry peers) to exact versions. The previous `^4.0.0-beta.102` range also matched `4.0.0-rc.*` prereleases, so fresh installs (e.g. `npx laymos`) resolved an incompatible `effect` build and crashed with `ERR_MODULE_NOT_FOUND`.
