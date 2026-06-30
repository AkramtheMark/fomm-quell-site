import requests
from bs4 import BeautifulSoup
import re
import json
import urllib3
from datetime import datetime

# Disable SSL verification warnings for sites with legacy/invalid certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configure fallback ComingSoon.it pages for the 13 cinemas
CINEMAS_FALLBACK = {
    "Al Corso": "https://www.comingsoon.it/cinema/reggio-emilia/al-corso/348/",
    "Rosebud": "https://www.comingsoon.it/cinema/reggio-emilia/rosebud/358/",
    "Nuovo Cinema Cristallo": "https://www.comingsoon.it/cinema/reggio-emilia/nuovo-cinema-cristallo/354/",
    "Olimpia": "https://www.comingsoon.it/cinema/reggio-emilia/olimpia/357/",
    "Arena Stalloni": "https://www.comingsoon.it/cinema/reggio-emilia/arena-stalloni/4260/",
    "Apollo": "https://www.comingsoon.it/cinema/reggio-emilia/apollo-albinea/134/",
    "Novecento": "https://www.comingsoon.it/cinema/reggio-emilia/novecento-cavriago/209/",
    "Cinepiù": "https://www.comingsoon.it/cinema/reggio-emilia/cinepiu-correggio/4619/",
    "Cinema Castello": "https://www.comingsoon.it/cinema/reggio-emilia/castello-fabbrico/228/",
    "Cinema Eden": "https://www.comingsoon.it/cinema/reggio-emilia/eden-quattro-castella/335/",
    "Cinema Boiardo": "https://www.comingsoon.it/cinema/reggio-emilia/boiardo-scandiano/1595/",
    "Cinema Bismantova": "https://www.comingsoon.it/cinema/reggio-emilia/bismantova-castelnovo-ne-monti/4475/",
    "CineClub Claudio Zambelli": "https://www.comingsoon.it/cinema/reggio-emilia/cineclub-claudio-zambelli-boretto/4553/"
}

COORDINATES = {
    "Al Corso": [44.698305, 10.627725],
    "Rosebud": [44.690805, 10.643324],
    "Nuovo Cinema Cristallo": [44.704732, 10.636603],
    "Olimpia": [44.686561, 10.631553],
    "Arena Stalloni": [44.699742, 10.638421],
    "Apollo": [44.628867, 10.597505],
    "Novecento": [44.695325, 10.528341],
    "Cinepiù": [44.773121, 10.781215],
    "Cinema Castello": [44.871923, 10.806653],
    "Cinema Eden": [44.623102, 10.472132],
    "Cinema Boiardo": [44.597143, 10.686621],
    "Cinema Bismantova": [44.437121, 10.404215],
    "CineClub Claudio Zambelli": [44.908321, 10.474132]
}

ADDRESSES = {
    "Al Corso": "Cinema Al Corso, Corso Garibaldi, Reggio Emilia",
    "Rosebud": "Cinema Rosebud, Via Medaglie d'Oro della Resistenza 6, Reggio Emilia",
    "Nuovo Cinema Cristallo": "Nuovo Cinema Cristallo, Via F. Bonini 4, Reggio Emilia",
    "Olimpia": "Cinema Olimpia, Via Tassoni 4, Reggio Emilia",
    "Arena Stalloni": "Arena Stalloni, Via Campo Samarotto 10/E, Reggio Emilia",
    "Apollo": "Cinema Teatro Apollo, Via Morandi 1/D, Albinea (RE)",
    "Novecento": "Multisala Novecento, Via del Cristo 5, Cavriago (RE)",
    "Cinepiù": "Multisala Cinepiù, P.le Riccardo Finzi 3, Correggio (RE)",
    "Cinema Castello": "Cinema Castello, Via Matteotti 4, Fabbrico (RE)",
    "Cinema Eden": "Cinema Eden, Piazza Gramsci 8/1, Quattro Castella (RE)",
    "Cinema Boiardo": "Cinema Teatro Boiardo, Via XXV Aprile 3, Scandiano (RE)",
    "Cinema Bismantova": "Teatro Cinema Bismantova, Via Roma 75, Castelnovo ne' Monti (RE)",
    "CineClub Claudio Zambelli": "CineClub Claudio Zambelli, Teatro del Fiume, Via Roma 31, Boretto (RE)"
}

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def parse_italian_date(text):
    """
    Parses various Italian date formats into DD/MM/YYYY.
    Supported: '30/06/2026', '30/06/26', 'giovedì 2/7', 'Mar 30 Giugno', 'MARTEDI' 30 GIUGNO'.
    """
    text = text.lower().strip()
    months = {
        "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
        "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
        "gen": 1, "feb": 2, "mar": 3, "apr": 4, "mag": 5, "giu": 6,
        "lug": 7, "ago": 8, "set": 9, "ott": 10, "nov": 11, "dic": 12
    }
    
    # 1. Check for DD/MM/YYYY or DD/MM/YY
    match = re.search(r'\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b', text)
    if match:
        day = int(match.group(1))
        month = int(match.group(2))
        year_str = match.group(3)
        year = int(year_str) if len(year_str) == 4 else 2000 + int(year_str)
        return f"{day:02d}/{month:02d}/{year}"
        
    # 2. Check for DD/MM
    match = re.search(r'\b(\d{1,2})/(\d{1,2})\b', text)
    if match:
        day = int(match.group(1))
        month = int(match.group(2))
        year = datetime.now().year
        return f"{day:02d}/{month:02d}/{year}"
        
    # 3. Check for word months: e.g. "30 giugno" or "1 luglio"
    for m_name, m_num in months.items():
        if m_name in text:
            match = re.search(r'\b(\d{1,2})\s+' + m_name, text)
            if match:
                day = int(match.group(1))
                year = datetime.now().year
                return f"{day:02d}/{m_num:02d}/{year}"
                
    return None

def clean_title(title):
    # Remove apostrophe/quotation normalization issues if any
    return title.replace("’", "'").replace("`", "'").strip()

def create_event(name, title, date, time, desc, link, img):
    event_id = f"cinema-{name.replace(' ', '-').lower()}-{title.replace(' ', '-').lower()}-{time.replace(':', '')}-{date.replace('/', '')}"
    event_id = re.sub(r'[^a-zA-Z0-9-]', '', event_id)
    return {
        "id": event_id,
        "title": clean_title(title),
        "category": "cinema",
        "date": date,
        "time": time,
        "location": f"{name} ({ADDRESSES[name].split(',')[-1].strip()})",
        "desc": desc,
        "link": link,
        "latitude": COORDINATES[name][0],
        "longitude": COORDINATES[name][1],
        "img": img
    }

# 1. ROSEBUD (Direct Scraper)
def scrape_rosebud():
    events = []
    name = "Rosebud"
    url = "https://rosebud.comune.re.it/la-programmazione/prossimamente-al-cinema"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')
        items = soup.find_all('div', class_='listing-item')
        for item in items:
            title_el = item.find('h3')
            title = title_el.text.strip() if title_el else ""
            if not title:
                continue
            
            link_el = item.find('a', class_='film-item')
            link = "https://rosebud.comune.re.it" + link_el['href'] if link_el else url
            
            img_el = item.find('img')
            img = "https://rosebud.comune.re.it" + img_el['src'] if img_el else ""
            
            date_raw = ""
            time = "21:30"  # default fallback
            regia = ""
            rassegna = ""
            for slot in item.find_all('div', class_='info-slot'):
                text = slot.text.strip()
                if "Data:" in text:
                    date_raw = text.replace("Data:", "").strip()
                elif "Orario:" in text:
                    time = text.replace("Orario:", "").strip()
                elif "Regia:" in text:
                    regia = text.replace("Regia:", "").strip()
                elif "Rassegna:" in text:
                    rassegna = text.replace("Rassegna:", "").strip()
            
            date = parse_italian_date(date_raw)
            if not date:
                continue
                
            desc_parts = []
            if rassegna:
                desc_parts.append(f"Rassegna: {rassegna}")
            if regia:
                desc_parts.append(f"Regia: {regia}")
            
            desc = " | ".join(desc_parts) if desc_parts else "Proiezione cinematografica."
            events.append(create_event(name, title, date, time, desc, link, img))
    except Exception as e:
        print(f"Error scraping Rosebud: {e}")
    return events

# 2. APOLLO (Direct Scraper)
def scrape_apollo():
    events = []
    name = "Apollo"
    url = "http://www.cinemaapolloalbinea.it/oggi"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')
        # Movies listed in today's programming page
        for h2 in soup.find_all('h2'):
            a = h2.find('a', href=lambda h: h and 'movie/' in h)
            if not a:
                continue
            title = a.text.strip()
            link = "http://www.cinemaapolloalbinea.it/" + a['href']
            
            parent = h2.find_parent('div', class_='col-md')
            row = parent.parent if parent else None
            
            img = ""
            if row:
                img_el = row.find('img', class_='movieEditPoster')
                if img_el:
                    img = img_el['src']
            
            # Fetch plot/genre/duration
            desc_parts = []
            if parent:
                genre_el = parent.find(lambda t: t.name == 'h5' and 'Genere:' in t.text)
                duration_el = parent.find(lambda t: t.name == 'h5' and 'Durata:' in t.text)
                regia_el = parent.find(lambda t: t.name == 'h5' and 'Regia:' in t.text)
                
                if genre_el:
                    desc_parts.append(genre_el.text.strip())
                if duration_el:
                    desc_parts.append(duration_el.text.strip())
                if regia_el:
                    desc_parts.append(regia_el.text.strip())
            
            desc = " | ".join(desc_parts) if desc_parts else "Proiezione cinematografica."
            
            # Parse showtimes table
            if parent:
                table = parent.find('table', class_='orari')
                if table:
                    for tr in table.find_all('tr'):
                        tds = tr.find_all('td')
                        if len(tds) >= 2:
                            raw_date = tds[0].text.strip()
                            date = parse_italian_date(raw_date)
                            if not date:
                                continue
                                
                            timing_span = tds[1].find('span', class_='timing')
                            time_str = timing_span.text.strip() if timing_span else tds[1].text.strip()
                            
                            # Clean time string (could be multiple times space separated, or single time)
                            for t in re.findall(r'\b(?:[01]\d|2[0-3])[:.][0-5]\d\b', time_str):
                                formatted_time = t.replace(".", ":")
                                events.append(create_event(name, title, date, formatted_time, desc, link, img))
    except Exception as e:
        print(f"Error scraping Apollo: {e}")
    return events

# 3. NOVECENTO (Direct Scraper)
def scrape_novecento():
    events = []
    name = "Novecento"
    url = "https://www.multisala900.it/IT/site/Home"
    try:
        r = requests.get(url, headers=headers, verify=False, timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')
        titles = soup.find_all('div', class_='titoloFilm')
        for t_div in titles:
            title = t_div.text.strip()
            if not title:
                continue
            
            parent_col = t_div.find_parent('div', class_='schedaFSl')
            row = parent_col.parent if parent_col else None
            
            img = ""
            link = url
            if row:
                img_el = row.find('img', class_='img-responsive')
                if img_el:
                    img = "https://www.multisala900.it" + img_el['src']
                
                a_el = row.find('a', href=lambda h: h and 'scheda' in h)
                if a_el:
                    link = "https://www.multisala900.it" + a_el['href']
            
            # Fetch sinossi/director/cast
            desc_parts = []
            if parent_col:
                dir_div = parent_col.find('div', class_='sottotitolo')
                if dir_div:
                    desc_parts.append(dir_div.text.replace("\n", "").replace("  ", " ").strip())
                dur_div = parent_col.find('div', class_='durata')
                if dur_div:
                    desc_parts.append(dur_div.text.replace("\n", "").replace("  ", " ").strip())
                    
            desc = " | ".join(desc_parts) if desc_parts else "Proiezione cinematografica."
            
            # Find times
            if parent_col:
                orari_p = parent_col.find('p', class_='filmOrari')
                if orari_p:
                    strong = orari_p.find('strong')
                    if strong:
                        time_str = strong.text.strip()
                        # Novecento lists today's movies
                        date = datetime.now().strftime("%d/%m/%Y")
                        for t in re.findall(r'\b(?:[01]\d|2[0-3])[:.][0-5]\d\b', time_str):
                            formatted_time = t.replace(".", ":")
                            events.append(create_event(name, title, date, formatted_time, desc, link, img))
    except Exception as e:
        print(f"Error scraping Novecento: {e}")
    return events

# 4. ARENA STALLONI (Direct Scraper)
def scrape_stalloni():
    events = []
    name = "Arena Stalloni"
    url = "https://www.arenastalloni.it/programma/"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')
        items = soup.find_all('div', class_='decm-events-details')
        for item in items:
            h2 = item.find('h2', class_='entry-title')
            if not h2:
                continue
            title = h2.text.strip()
            link_el = h2.find('a')
            link = link_el['href'] if link_el else url
            
            row = item.find_parent('div', class_='row')
            img = ""
            if row:
                img_el = row.find('img', class_='ecs_event_feed_image')
                if img_el:
                    img = img_el['src']
            
            # Date & Time
            date_span = item.find('span', class_='decm_date')
            raw_date = date_span.text.strip() if date_span else ""
            date = parse_italian_date(raw_date)
            if not date:
                continue
                
            time_span = item.find('span', class_='ecs-eventTime')
            time_inner = time_span.find('span', class_='decm_date') if time_span else None
            time_str = time_inner.text.strip() if time_inner else "21:30"
            
            # Rassegna
            desc = "Proiezione all'aperto Arena Stalloni."
            cat_span = item.find('span', class_='decm_categories')
            if cat_span:
                desc = f"Rassegna: {cat_span.text.strip()}"
                
            for t in re.findall(r'\b(?:[01]\d|2[0-3])[:.][0-5]\d\b', time_str):
                formatted_time = t.replace(".", ":")
                events.append(create_event(name, title, date, formatted_time, desc, link, img))
    except Exception as e:
        print(f"Error scraping Arena Stalloni: {e}")
    return events

# 5. AL CORSO (Direct Scraper)
def scrape_al_corso():
    events = []
    name = "Al Corso"
    url = "https://cinemaalcorso.com/"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')
        articles = soup.find_all('article', class_='ecs-post-loop')
        for art in articles:
            title_el = art.find('h1', class_='elementor-heading-title')
            if not title_el:
                continue
            title = title_el.text.strip()
            
            img = ""
            link = url
            img_container = art.find('div', class_='elementor-image')
            if img_container:
                a_el = img_container.find('a')
                if a_el:
                    link = a_el['href']
                    img_el = a_el.find('img')
                    if img_el:
                        img = img_el['src']
            
            # Find date & times
            headings = art.find_all('h2', class_='elementor-heading-title')
            desc = "Proiezione cinematografica Cinema Al Corso."
            
            # Look for rassegna text
            desc_el = art.find(lambda t: t.name == 'h2' and 'rassegna' in t.text.lower())
            if desc_el:
                desc = desc_el.text.strip()
                
            for h in headings:
                text = h.text.strip()
                if "ore " in text or ":" in text:
                    # e.g. "MARTEDI' 30 GIUGNO: ore 21:00"
                    date = parse_italian_date(text)
                    if not date:
                        continue
                    
                    time_match = re.search(r'\bore\s+(\d{2}[:.]\d{2})\b', text, re.IGNORECASE)
                    time_str = time_match.group(1).replace(".", ":") if time_match else "21:00"
                    
                    events.append(create_event(name, title, date, time_str, desc, link, img))
    except Exception as e:
        print(f"Error scraping Al Corso: {e}")
    return events

# 6. CINEMA EDEN (Direct Scraper)
def scrape_eden():
    events = []
    name = "Cinema Eden"
    url = "https://cinemaeden.org/category/programmazione/ora_al_cinema/"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        soup = BeautifulSoup(r.text, 'html.parser')
        posts = soup.find_all('li', class_='wp-block-post')
        for post in posts:
            title_el = post.find('h3', class_='wp-block-eden-film-title')
            if not title_el:
                continue
            title = title_el.text.strip()
            
            img = ""
            link = url
            fig = post.find('figure', class_='wp-block-post-featured-image')
            if fig:
                img_el = fig.find('img')
                if img_el:
                    img = img_el['src']
            
            btn = post.find('div', class_='wp-block-button')
            if btn:
                a_el = btn.find('a')
                if a_el:
                    link = a_el['href']
            
            # Sinossi
            desc = "Proiezione cinematografica Cinema Eden."
            plot_el = post.find('div', class_='plot-text-content')
            if plot_el:
                desc = plot_el.text.strip()[:180] + "..."
                
            # Date & times
            date_container = post.find('div', class_='wp-block-eden-film-date')
            if date_container:
                for row in date_container.find_all('div', class_='eden-row'):
                    line = row.find('div', class_='eden-line')
                    if line:
                        day_el = line.find('div', class_='eden-row-name')
                        time_el = line.find('div', class_='eden-row-time')
                        if day_el and time_el:
                            date = parse_italian_date(day_el.text.strip())
                            if not date:
                                continue
                            
                            # Clean time: e.g. "ore 20:45"
                            time_match = re.search(r'\b(\d{2}[:.]\d{2})\b', time_el.text.strip())
                            time_str = time_match.group(1).replace(".", ":") if time_match else "21:00"
                            
                            events.append(create_event(name, title, date, time_str, desc, link, img))
    except Exception as e:
        print(f"Error scraping Cinema Eden: {e}")
    return events

# FALLBACK SORGENTE GENERICA (ComingSoon.it)
def scrape_comingsoon(name, url):
    events = []
    try:
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        today_str = datetime.now().strftime("%d/%m/%Y")
        
        cards = soup.find_all('div', class_='header-scheda')
        for card in cards:
            title_link = card.find('a', class_='tit_olo')
            if not title_link:
                continue
            title = title_link.text.strip()
            movie_url = "https://www.comingsoon.it" + title_link['href'] if title_link['href'].startswith('/') else title_link['href']
            
            genre = ""
            duration = ""
            cast = ""
            meta_div = card.find('div', class_='meta')
            if meta_div:
                for p in meta_div.find_all('div', class_='p'):
                    text = p.text.strip()
                    if "genere:" in text.lower():
                        genre = p.find('span').text.strip() if p.find('span') else text.split("Genere:")[-1].strip()
                    elif "durata:" in text.lower():
                        duration = p.find('span').text.strip() if p.find('span') else text.split("Durata:")[-1].strip()
                    elif "cast:" in text.lower():
                        cast = p.find('span').text.strip() if p.find('span') else text.split("Cast:")[-1].strip()
            
            times = []
            all_times = re.findall(r'\b(0\d|1\d|2[0-3])\.([0-5]\d)\b', card.text)
            for h, m in all_times:
                times.append(f"{h}:{m}")
            times = sorted(list(set(times)))
            
            if not times:
                continue
                
            img_tag = card.find('img')
            img_url = ""
            if img_tag:
                img_url = img_tag.get('src') or img_tag.get('data-src') or ""
                if img_url.startswith('//'):
                    img_url = "https:" + img_url
                    
            desc_parts = []
            if genre:
                desc_parts.append(f"Genere: {genre}")
            if duration:
                desc_parts.append(f"Durata: {duration}")
            if cast:
                desc_parts.append(f"Cast: {cast}")
            desc = " | ".join(desc_parts) if desc_parts else "Proiezione cinematografica."
            
            for t in times:
                events.append(create_event(name, title, today_str, t, desc, movie_url, img_url))
        print(f"Scraped {len(events)} events for cinema: {name} (ComingSoon Fallback)")
    except Exception as e:
        print(f"Error scraping ComingSoon fallback for {name}: {e}")
    return events

def main():
    all_events = []
    
    # Mapping of cinemas to custom scrapers
    custom_scrapers = {
        "Rosebud": scrape_rosebud,
        "Apollo": scrape_apollo,
        "Novecento": scrape_novecento,
        "Arena Stalloni": scrape_stalloni,
        "Al Corso": scrape_al_corso,
        "Cinema Eden": scrape_eden
    }
    
    for name, url in CINEMAS_FALLBACK.items():
        if name in custom_scrapers:
            print(f"Scraping {name} directly from official website...")
            events = custom_scrapers[name]()
            print(f"Scraped {len(events)} events for cinema: {name} (Direct)")
            if not events:
                print(f"Direct scraper returned 0 events for {name}, falling back to ComingSoon...")
                events = scrape_comingsoon(name, url)
            all_events.extend(events)
        else:
            print(f"Scraping {name} using ComingSoon fallback...")
            events = scrape_comingsoon(name, url)
            all_events.extend(events)
            
    # Filter out duplicate events (same title, date, time, location)
    unique_events = []
    seen_keys = set()
    for ev in all_events:
        key = (ev["title"].lower(), ev["date"], ev["time"], ev["location"].lower())
        if key not in seen_keys:
            seen_keys.add(key)
            unique_events.append(ev)
            
    output_path = "assets/cinema_events.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(unique_events, f, ensure_ascii=False, indent=2)
        
    print(f"Scraping completed. Wrote {len(unique_events)} unique events to {output_path}")

if __name__ == "__main__":
    main()
