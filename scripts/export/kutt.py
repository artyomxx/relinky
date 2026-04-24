#!/usr/bin/env python3
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_LIMIT = 500
DEFAULT_PAGE_SIZE = 100
LINKS_ENDPOINT = "/api/v2/links"
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data"


def iso_now() -> str:
	return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def fetch_page(base_url: str, api_key: str, page_size: int, skip: int, timeout: int) -> tuple[list[dict], int | None]:
	query = urlencode({"limit": page_size, "skip": skip})
	url = f"{base_url.rstrip('/')}{LINKS_ENDPOINT}?{query}"
	request = Request(
		url,
		headers={
			"X-API-KEY": api_key,
			"Accept": "application/json",
		},
		method="GET",
	)

	try:
		with urlopen(request, timeout=timeout) as response:
			payload = json.loads(response.read().decode("utf-8"))
	except HTTPError as exc:
		if exc.code == 401:
			raise RuntimeError("Authentication failed (401). Check -key") from exc
		details = exc.read().decode("utf-8", errors="replace")
		raise RuntimeError(f"Kutt API error {exc.code}: {details}") from exc
	except URLError as exc:
		raise RuntimeError(f"Network error: {exc}") from exc

	items = payload.get("data", [])
	if not isinstance(items, list):
		raise RuntimeError("Unexpected Kutt response: expected `data` to be a list")
	total = payload.get("total")
	if total is not None and not isinstance(total, int):
		total = None
	return items, total


def fetch_all_links(base_url: str, api_key: str, limit: int, timeout: int, page_size: int) -> list[dict]:
	all_links: list[dict] = []
	seen_keys: set[str] = set()
	skip = 0
	page = 1
	known_total: int | None = None

	while True:
		if len(all_links) >= limit:
			print(f"[kutt] reached requested limit={limit}, stopping")
			break

		print(f"[kutt] fetching page={page} skip={skip} page_size={page_size} target_limit={limit}")
		page_items, page_total = fetch_page(base_url, api_key, page_size, skip, timeout)
		if page_total is not None:
			known_total = page_total

		if not page_items:
			print(f"[kutt] page={page} returned 0 items, stopping")
			break

		new_count = 0
		for item in page_items:
			item_key = item.get("id") or json.dumps(item, sort_keys=True)
			if item_key in seen_keys:
				continue
			seen_keys.add(item_key)
			if len(all_links) >= limit:
				break
			all_links.append(item)
			new_count += 1

		total_hint = f"/{known_total}" if known_total is not None else ""
		print(f"[kutt] page={page} returned={len(page_items)} new={new_count} total={len(all_links)}{total_hint}")

		# If the API starts returning already-seen records, stop to avoid loops
		# on instances that ignore or cap pagination parameters unexpectedly.
		if new_count == 0:
			print(f"[kutt] page={page} has no new items, stopping to avoid repeated pages")
			break
		if known_total is not None and len(all_links) >= known_total:
			print(f"[kutt] reached reported total={known_total}, stopping")
			break
		if len(all_links) >= limit:
			print(f"[kutt] reached requested limit={limit}, stopping")
			break

		# Advance by what the API actually returned.
		# Some Kutt instances cap page size server-side (e.g. 50),
		# so using requested `limit` can skip data or stop too early.
		skip += len(page_items)
		page += 1

	return all_links


def write_json(output_path: Path, links: list[dict]) -> None:
	output_path.write_text(json.dumps(links, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Export all links from a Kutt instance")
	parser.add_argument("host_positional", nargs="?", help="Kutt host (positional), example: domain.com")
	parser.add_argument("key_positional", nargs="?", help="Kutt API key (positional)")
	parser.add_argument("--host", help="Kutt host, overrides positional host")
	parser.add_argument("--key", help="Kutt API key, overrides positional key")
	parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help=f"Maximum links to export (default: {DEFAULT_LIMIT})")
	parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, help=f"API page size hint (default: {DEFAULT_PAGE_SIZE})")
	parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
	parser.add_argument("--output", help="Output file path")
	args = parser.parse_args()

	args.host = args.host or args.host_positional
	args.key = args.key or args.key_positional

	if not args.host:
		parser.error("host is required (use positional host or --host)")
	if not args.key:
		parser.error("key is required (use positional key or --key)")
	if args.limit <= 0:
		parser.error("--limit must be > 0")
	if args.page_size <= 0:
		parser.error("--page-size must be > 0")

	return args


def normalize_host(host: str) -> str:
	if host.startswith("http://") or host.startswith("https://"):
		return host
	return f"https://{host}"


def main() -> int:
	args = parse_args()
	base_url = normalize_host(args.host)

	DATA_DIR.mkdir(parents=True, exist_ok=True)
	default_output = DATA_DIR / f"kutt-links-{iso_now()}.json"
	output_path = Path(args.output) if args.output else default_output
	output_path.parent.mkdir(parents=True, exist_ok=True)

	try:
		links = fetch_all_links(
			base_url=base_url,
			api_key=args.key,
			limit=args.limit,
			timeout=args.timeout,
			page_size=args.page_size,
		)
	except RuntimeError as exc:
		print(str(exc), file=sys.stderr)
		return 1

	write_json(output_path, links)

	print(f"Exported {len(links)} links to {output_path}")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
