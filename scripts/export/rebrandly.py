#!/usr/bin/env python3
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://api.rebrandly.com/v1"
DEFAULT_LIMIT = 25
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data"


def iso_now() -> str:
	return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def fetch_page(
	base_url: str,
	api_key: str,
	workspace: str | None,
	limit: int,
	last_id: str | None,
	timeout: int,
) -> list[dict]:
	query = {"limit": limit}
	if last_id:
		query["last"] = last_id

	url = f"{base_url.rstrip('/')}/links?{urlencode(query)}"
	headers = {
		"apikey": api_key,
		"Content-Type": "application/json",
	}
	if workspace:
		headers["workspace"] = workspace

	request = Request(url, headers=headers, method="GET")
	try:
		with urlopen(request, timeout=timeout) as response:
			payload = json.loads(response.read().decode("utf-8"))
	except HTTPError as exc:
		details = exc.read().decode("utf-8", errors="replace")
		if exc.code in (401, 403):
			raise RuntimeError(f"Authentication/authorization failed ({exc.code}). Check credentials") from exc
		raise RuntimeError(f"Rebrandly API error {exc.code}: {details}") from exc
	except URLError as exc:
		raise RuntimeError(f"Network error: {exc}") from exc

	if not isinstance(payload, list):
		raise RuntimeError("Unexpected Rebrandly response: expected a JSON array")
	return payload


def fetch_all_links(
	base_url: str,
	api_key: str,
	workspace: str | None,
	limit: int,
	timeout: int,
	start_after: str | None,
) -> list[dict]:
	all_links: list[dict] = []
	last_id = start_after

	while True:
		page_items = fetch_page(
			base_url=base_url,
			api_key=api_key,
			workspace=workspace,
			limit=limit,
			last_id=last_id,
			timeout=timeout,
		)
		if not page_items:
			break
		all_links.extend(page_items)
		last_id = page_items[-1].get("id")
		if not last_id:
			break

	return all_links


def write_json(output_path: Path, links: list[dict]) -> None:
	output_path.write_text(json.dumps(links, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Export all links from Rebrandly")
	parser.add_argument("key_positional", nargs="?", help="Rebrandly API key (positional)")
	parser.add_argument("--key", help="Rebrandly API key, overrides positional key")
	parser.add_argument(
		"--workspace",
		help="Optional workspace id",
	)
	parser.add_argument(
		"--host",
		default=DEFAULT_BASE_URL,
		help=f"API base URL (default: {DEFAULT_BASE_URL})",
	)
	parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help=f"Page size (default: {DEFAULT_LIMIT})")
	parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
	parser.add_argument("--start-after", help="Resume export after this link id")
	parser.add_argument("--output", help="Output file path")
	args = parser.parse_args()

	args.key = args.key or args.key_positional
	if not args.key:
		parser.error("key is required (use positional key or --key)")

	return args


def main() -> int:
	args = parse_args()

	DATA_DIR.mkdir(parents=True, exist_ok=True)
	default_output = DATA_DIR / f"rebrandly-links-{iso_now()}.json"
	output_path = Path(args.output) if args.output else default_output
	output_path.parent.mkdir(parents=True, exist_ok=True)

	try:
		links = fetch_all_links(
			base_url=args.host,
			api_key=args.key,
			workspace=args.workspace,
			limit=args.limit,
			timeout=args.timeout,
			start_after=args.start_after,
		)
	except RuntimeError as exc:
		print(str(exc), file=sys.stderr)
		return 1

	write_json(output_path, links)

	print(f"Exported {len(links)} links to {output_path}")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
