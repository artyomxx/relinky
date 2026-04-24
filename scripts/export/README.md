# Link Export Scripts

Two dependency-free Python scripts are available in this folder:

- `kutt.py` for Kutt
- `rebrandly.py` for Rebrandly

Both scripts:

- use only Python standard library (no `pip install` needed)
- write output to `scripts/export/data` by default
- write JSON output only

## Kutt

```bash
./kutt.py domain.com your-api-key
```

Required args:

- positional: `<host> <key>`
- or explicit: `--host domain.com --key your-api-key`

Limit examples:

- export first 500 links: `./kutt.py domain.com your-api-key --limit 500`

## Rebrandly

```bash
./rebrandly.py your-api-key
```

Required args:

- positional: `<key>`
- or explicit: `--key your-api-key`

Optional args:

- `--workspace`
- `--host` (default: `https://api.rebrandly.com/v1`)

## Output

By default, files are created in:

- `scripts/export/data/kutt-links-<timestamp>.json`
- `scripts/export/data/rebrandly-links-<timestamp>.json`

Use `--output <path>` to override the output file.
