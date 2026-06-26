import requests
from bs4 import BeautifulSoup
import re
import json
from datetime import datetime

# Configure target cinemas on ComingSoon.it
CINEMAS = {
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

def scrape_cinema(name, url):
    events = []
    try:
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # Today's date in DD/MM/YYYY format
        today_str = datetime.now().strftime("%d/%m/%Y")
        
        # Each movie is represented by a div with class 'header-scheda'
        cards = soup.find_all('div', class_='header-scheda')
        for card in cards:
            title_link = card.find('a', class_='tit_olo')
            if not title_link:
                continue
            title = title_link.text.strip()
            movie_url = "https://www.comingsoon.it" + title_link['href'] if title_link['href'].startswith('/') else title_link['href']
            
            # Extract genre, duration and cast
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
            
            # Parse showtimes
            times = []
            # Match 24-hour patterns like "21.00", "18.30", "16.00"
            all_times = re.findall(r'\b(0\d|1\d|2[0-3])\.([0-5]\d)\b', card.text)
            for h, m in all_times:
                times.append(f"{h}:{m}")
                
            # Filter unique times and sort them
            times = sorted(list(set(times)))
            
            if not times:
                # If no showtimes are found, the movie might not be playing today
                continue
                
            # Extract image poster
            img_tag = card.find('img')
            img_url = ""
            if img_tag:
                img_url = img_tag.get('src') or img_tag.get('data-src') or ""
                if img_url.startswith('//'):
                    img_url = "https:" + img_url
                    
            # Build description
            desc_parts = []
            if genre:
                desc_parts.append(f"Genere: {genre}")
            if duration:
                desc_parts.append(f"Durata: {duration}")
            if cast:
                desc_parts.append(f"Cast: {cast}")
            desc = " | ".join(desc_parts) if desc_parts else "Proiezione cinematografica."
            
            # Create a separate event object for each showtime
            for t in times:
                event_id = f"cinema-{name.replace(' ', '-').lower()}-{title.replace(' ', '-').lower()}-{t.replace(':', '')}"
                # Remove special characters from id
                event_id = re.sub(r'[^a-zA-Z0-9-]', '', event_id)
                
                events.append({
                    "id": event_id,
                    "title": title,
                    "category": "cinema",
                    "date": today_str,
                    "time": t,
                    "location": f"{name} ({ADDRESSES[name].split(',')[-1].strip()})",
                    "desc": desc,
                    "link": movie_url,
                    "latitude": COORDINATES[name][0],
                    "longitude": COORDINATES[name][1],
                    "img": img_url
                })
        print(f"Scraped {len(events)} events for cinema: {name}")
    except Exception as e:
        print(f"Error scraping cinema {name}: {e}")
    return events

def main():
    all_events = []
    for name, url in CINEMAS.items():
        all_events.extend(scrape_cinema(name, url))
        
    output_path = "assets/cinema_events.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_events, f, ensure_ascii=False, indent=2)
        
    print(f"Scraping completed. Wrote {len(all_events)} events to {output_path}")

if __name__ == "__main__":
    main()
