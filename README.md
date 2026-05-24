# omnidns ruleset

Pre-built `.drs` rulesets converted from [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat/tree/meta/geo/geosite).

Updated: 2026-05-24 07:39 UTC
Source: `MetaCubeX/meta-rules-dat@meta/geo/geosite`

| | Count |
|---|---|
| YAML source files | 333 |
| DRS ruleset files | 333 |

## Usage

Download a `.drs` file and reference it in your omnidns config:

```toml
[[dns.rules]]
rulesets = ["/etc/omnidns/rules/cn.drs"]
upstream = "china"
```

Or use the raw URL directly in a script:

```bash
curl -fsSL https://raw.githubusercontent.com/evecus/omnidns/ruleset/cn.drs \
  -o /etc/omnidns/rules/cn.drs
```

## Files

Each file corresponds to a geosite category. Common ones:

| File | Description |
|------|-------------|
| `cn.drs` | Chinese mainland domains |
| `geolocation-!cn.drs` | Non-Chinese domains |
| `category-ads-all.drs` | Ad/tracker domains |
| `google.drs` | Google services |
| `microsoft.drs` | Microsoft services |
| `apple.drs` | Apple services |
