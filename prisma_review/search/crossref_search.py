"""Crossref search backend using REST API."""

from __future__ import annotations

import re
import time
import requests
from ..models import Paper
from .query_plan import text_search_query

API_URL = "https://api.crossref.org/works"


def _clean_query(query: str) -> str:
	"""Reduce a Boolean query to Crossref's plain-text search string.

	Delegates to the shared helper so the transparency warnings reported by
	``search.query_plan`` match exactly what is sent here.
	"""
	return text_search_query(query)


def search_crossref(query: str, date_start: str, date_end: str,
                    max_results: int = 500, email: str = "") -> list[Paper]:
	"""Search Crossref and return normalized Paper objects."""
	search_text = _clean_query(query)
	start_year = int(date_start[:4])
	end_year = int(date_end[:4])

	papers = []
	cursor = "*"
	count = 0

	try:
		while count < max_results and cursor:
			params = {
				"query": search_text,
				"filter": f"from-pub-date:{date_start},until-pub-date:{date_end}",
				"rows": min(100, max_results - count),
				"cursor": cursor,
			}
			if email:
				params["mailto"] = email

			resp = requests.get(API_URL, params=params, timeout=10)

			if resp.status_code == 429:
				time.sleep(30)
				continue

			if resp.status_code != 200:
				print(f"  [!] Crossref API error: HTTP {resp.status_code}")
				break

			data = resp.json()
			items = data.get("message", {}).get("items", [])

			if not items:
				break

			for item in items:
				if count >= max_results:
					break

				title_list = item.get("title", [])
				title = title_list[0] if title_list else ""
				if not title:
					continue

				authors = []
				for author in item.get("author", []):
					given = author.get("given", "")
					family = author.get("family", "")
					name = f"{given} {family}".strip()
					if name:
						authors.append(name)

				abstract = item.get("abstract", "")
				if abstract:
					abstract = re.sub(r'<[^>]+>', '', abstract).strip()

				year = 0
				pub_date = item.get("published", {}).get("date-parts")
				if pub_date and isinstance(pub_date, list) and pub_date[0]:
					year = pub_date[0][0] if isinstance(pub_date[0], list) else pub_date[0]

				doi = item.get("DOI", "")
				url = item.get("URL", "")
				if not url and doi:
					url = f"https://doi.org/{doi}"

				venue_list = item.get("container-title", [])
				venue = venue_list[0] if venue_list else ""

				keywords = item.get("subject", [])

				paper = Paper(
					title=title.strip(),
					authors=authors,
					abstract=abstract,
					year=year,
					doi=doi if doi else None,
					url=url,
					venue=venue,
					keywords=keywords,
					source="crossref",
					source_id=doi if doi else "",
				)
				papers.append(paper)
				count += 1

			cursor = data.get("message", {}).get("next-cursor")

	except Exception as e:
		print(f"  [!] Crossref search error: {e}")

	return papers
