import httpx
from bs4 import BeautifulSoup
import asyncio
import random

from app.models.schemas import WordReferenceResponse, WRCategory, WREntry, WRExample

# Multiple User-Agent strings to reduce fingerprinting-based blocking
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
]

async def _fetch_with_retry(client: httpx.AsyncClient, url: str, max_retries: int = 3) -> httpx.Response | None:
    """Fetch a URL with retry logic for anti-bot challenges (HTTP 418) and rate limiting."""
    for attempt in range(max_retries):
        headers = {
            "User-Agent": random.choice(_USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
        }
        try:
            resp = await client.get(url, headers=headers)

            if resp.status_code == 418:
                # Anti-bot challenge — wait and retry (the cookie should handle it)
                wait = 1.5 * (attempt + 1) + random.uniform(0.2, 0.8)
                print(f"[WordReference] Got 418 anti-bot challenge for {url}, retrying in {wait:.1f}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(wait)
                continue

            if resp.status_code == 429:
                wait = 3.0 * (attempt + 1) + random.uniform(0.5, 1.5)
                print(f"[WordReference] Rate limited (429) for {url}, retrying in {wait:.1f}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(wait)
                continue

            if resp.status_code != 200:
                print(f"[WordReference] Unexpected status {resp.status_code} for {url}")
                return None

            return resp

        except httpx.TimeoutException:
            wait = 2.0 * (attempt + 1)
            print(f"[WordReference] Timeout for {url}, retrying in {wait:.1f}s (attempt {attempt + 1}/{max_retries})")
            await asyncio.sleep(wait)
        except Exception as e:
            print(f"[WordReference] Request error for {url}: {e}")
            return None

    print(f"[WordReference] All {max_retries} retries exhausted for {url}")
    return None


async def lookup(word: str, source_lang: str, target_lang: str) -> dict | None:
    """Fetch and scrape definitions from WordReference, handling pagination recursively."""
    if source_lang == "auto":
        # WordReference needs a bilingual dictionary pair — infer a sensible source.
        # If target is already English, assume the source is Italian (the app's primary use case).
        # Otherwise default source to English.
        source_lang = "it" if target_lang == "en" else "en"
        
    # WordReference only works with bilingual dictionaries; skip if same language pair
    if source_lang == target_lang:
        print(f"[WordReference] Skipping: source_lang == target_lang == '{source_lang}'")
        return None
        
    dict_code = source_lang + target_lang
    
    # WordReference serves an anti-bot challenge (HTTP 418) that asks the client to
    # set this cookie and reload. Sending it up front bypasses the challenge.
    cookies = {"nginx_wr_human": "1"}

    categories_dict: dict[str, list[WREntry]] = {}

    start_val = 0
    max_pages = 10  # Safety limit

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, cookies=cookies) as client:
        for page in range(max_pages):
            url = f"https://www.wordreference.com/{dict_code}/{word}"
            if start_val > 0:
                url += f"?start={start_val}"
                
            try:
                resp = await _fetch_with_retry(client, url)
                if resp is None:
                    print(f"[WordReference] Failed to fetch page {page} for '{word}'")
                    break
                    
                soup = BeautifulSoup(resp.text, 'html.parser')
                tables = soup.find_all('table', class_='WRD')
                if not tables:
                    title_tag = soup.find('title')
                    page_title = title_tag.get_text(strip=True) if title_tag else '(no title)'
                    print(f"[WordReference] No WRD tables found for '{word}' (page title: {page_title}, response size: {len(resp.text)} bytes)")
                    break
                    
                entries_count = 0
                
                for table in tables:
                    current_category_title = ""
                    current_entry = None
                    current_source_example = ""
                    
                    for tr in table.find_all('tr'):
                        classes = tr.get('class', [])
                        if 'wrtopsection' in classes:
                            td_title = tr.find(['td', 'th'])
                            if td_title:
                                title = td_title.get('title') or td_title.get_text(strip=True)
                                current_category_title = title
                                if current_category_title not in categories_dict:
                                    categories_dict[current_category_title] = []
                            current_entry = None
                            continue
                            
                        if 'odd' in classes or 'even' in classes:
                            fr_wrd_td = tr.find('td', class_='FrWrd')
                            if fr_wrd_td and fr_wrd_td.get_text(strip=True):
                                # New entry
                                source_word = ""
                                strong = fr_wrd_td.find('strong')
                                if strong:
                                    source_word = strong.get_text(strip=True)
                                else:
                                    source_word = fr_wrd_td.get_text(strip=True).split("\xa0")[0]
                                    
                                pos_em = fr_wrd_td.find('em', class_='POS2')
                                source_pos = pos_em.get_text(strip=True) if pos_em else ""
                                
                                tds = tr.find_all('td', recursive=False)
                                context = ""
                                if len(tds) > 1:
                                    context = tds[1].get_text(strip=True)
                                    
                                target_word = ""
                                target_pos = ""
                                to_wrd_td = tr.find('td', class_='ToWrd')
                                if to_wrd_td:
                                    target_pos_em = to_wrd_td.find('em', class_='POS2')
                                    target_pos = target_pos_em.get_text(strip=True) if target_pos_em else ""
                                    if target_pos_em:
                                        target_pos_em.extract()
                                    target_word = to_wrd_td.get_text(strip=True)
                                    
                                current_entry = WREntry(
                                    source_word=source_word,
                                    source_pos=source_pos,
                                    context=context,
                                    target_word=target_word,
                                    target_pos=target_pos,
                                    examples=[]
                                )
                                
                                if current_category_title in categories_dict:
                                    categories_dict[current_category_title].append(current_entry)
                                    entries_count += 1
                                continue
                                
                            if current_entry:
                                to_wrd_td = tr.find('td', class_='ToWrd')
                                fr_ex_td = tr.find('td', class_='FrEx')
                                to_ex_td = tr.find('td', class_='ToEx')
                                
                                if to_wrd_td:
                                    target_pos_em = to_wrd_td.find('em', class_='POS2')
                                    t_pos = target_pos_em.get_text(strip=True) if target_pos_em else ""
                                    if target_pos_em:
                                        target_pos_em.extract()
                                    t_word = to_wrd_td.get_text(strip=True)
                                    if t_word:
                                        current_entry.target_word += f", {t_word}"
                                        if t_pos and not current_entry.target_pos:
                                            current_entry.target_pos = t_pos
                                            
                                elif fr_ex_td:
                                    current_source_example = fr_ex_td.get_text(strip=True)
                                    
                                elif to_ex_td:
                                    target_example = to_ex_td.get_text(strip=True)
                                    if current_source_example:
                                        current_entry.examples.append(WRExample(
                                            source=current_source_example,
                                            target=target_example
                                        ))
                                        current_source_example = ""

                # Next page increment?
                # Does the page have > 100 entries natively or overall?
                # Sometimes we don't know if we should proceed unless it's full.
                if entries_count == 0:
                    break
                    
                start_val += 100
            except Exception as e:
                print(f"[WordReference] Scrape Error: {e}")
                break
                
    if not categories_dict:
        print(f"[WordReference] No results parsed for '{word}' ({dict_code})")
        return None
    
    total_entries = sum(len(entries) for entries in categories_dict.values())
    print(f"[WordReference] Found {total_entries} entries for '{word}' ({dict_code})")
        
    categories = []
    for title, entries in categories_dict.items():
        if entries:
            categories.append(WRCategory(title=title, entries=entries))
            
    return {"word": word, "categories": categories}
