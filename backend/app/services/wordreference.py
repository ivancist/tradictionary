import httpx
from bs4 import BeautifulSoup
import asyncio

from app.models.schemas import WordReferenceResponse, WRCategory, WREntry, WRExample

async def lookup(word: str, source_lang: str, target_lang: str) -> dict | None:
    """Fetch and scrape definitions from WordReference, handling pagination recursively."""
    if source_lang == "auto":
        source_lang = "en"
        
    dict_code = source_lang + target_lang
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    categories_dict: dict[str, list[WREntry]] = {}
    
    start_val = 0
    max_pages = 10  # Safety limit
    
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        for page in range(max_pages):
            url = f"https://www.wordreference.com/{dict_code}/{word}"
            if start_val > 0:
                url += f"?start={start_val}"
                
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    break
                    
                soup = BeautifulSoup(resp.text, 'html.parser')
                tables = soup.find_all('table', class_='WRD')
                if not tables:
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
        return None
        
    categories = []
    for title, entries in categories_dict.items():
        if entries:
            categories.append(WRCategory(title=title, entries=entries))
            
    return {"word": word, "categories": categories}
