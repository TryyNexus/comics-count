# Comics Count 2.0 📚
### Gestore Avanzato Uscite, Acquisti, Copertine & Contabilità Fumetti

Applicazione completa e moderna per il tracciamento della collezione, pianificazione delle uscite mensili, gestione ordini/preordini e controllo contabile delle spese, sviluppata specificamente sulla struttura del file personale **`Fumetti.xlsx`** (OneDrive).

---

## 🚀 Avvio Rapido

### 1. Avvio Immediato con Doppio Clic (Windows)
Fai doppio clic sul file:
```
avvia_comics_count.bat
```
Questo comando avvia il server locale e apre automaticamente il browser all'indirizzo **`http://localhost:3001`**.

### 2. Avvio da Terminale (PowerShell o CMD)
```bash
# Entra nella cartella di backend e avvia
cd "d:\Antigravity\Comics Count\backend"
node server.js
```

### 3. Modalità Sviluppo (Hot Reload Vite + Backend)
```bash
# Terminale 1 (Backend API su porta 3001)
cd backend
node server.js

# Terminale 2 (Frontend Vite su porta 5173 con proxy su 3001)
cd frontend
npm.cmd run dev
```

---

## 🏗️ Architettura e Stack Tecnologico

- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 + Lucide Icons + Recharts (grafici interattivi).
- **Backend:** Node.js 24 + Express 5 + SQLite ad alte prestazioni (`better-sqlite3` con modalità WAL).
- **Archiviazione Copertine:** Caching locale in `backend/uploads/covers/` per rendering istantaneo anche offline.
- **Motore Metadati & Copertine:** Motore ibrido multi-provider con fallback intelligente:
  1. **Open Library API:** Ricerca gratuita, codici ISBN-10, ISBN-13 ed EAN, copertine ad alta definizione.
  2. **MangaDex API:** Copertine ufficiali giapponesi/internazionali dei singoli volumi per tutti i manga.
  3. **Google Books API:** Fallback per edizioni editoriali e codici a barre.
  4. **Upload Diretto & Link Rapido a Google Immagini:** Per variant ultra-rare, spillati variant o commission da fiera.
- **Import/Export Engine:** Script `xlsx` in grado di importare l'intero file `Fumetti.xlsx` (640+ volumi storici, 58 vendite, ordini store, preordini HVC, letture) e di ri-esportare in Excel `.xlsx` multi-foglio e backup `.json`.

---

## 🗄️ Schema del Database (SQLite)

### 1. `comics` (Scheda Fumetto Completa)
- `id`: Chiave primaria auto-incrementante
- `title`: Titolo / Testata
- `series`: Serie di appartenenza
- `issue_number`: Numero / Volume / Spillato
- `variant_info`: Variante (es. *CVR A*, *Variant Cappuccio*, *Foil*, *Blind Bag*, *Blank*)
- `publisher_id`: Riferimento alla casa editrice (`publishers`)
- `year`, `month`: Viste temporali (es. 2026, Ottobre)
- `release_date`, `purchase_date`: Date effettive di uscita o acquisto
- `cover_price`: Prezzo di copertina ufficiale (€)
- `purchase_price`: Prezzo effettivamente pagato (€)
- `isbn`, `ean`, `upc`: Codici a barre identificativi univoci
- `cover_url`, `local_cover_path`: URL o path locale della copertina memorizzata
- `status`: *In uscita*, *Preordinato*, *Acquistato*, *Da leggere*, *In lettura*, *Letto*, *Venduto*
- `channel`: Canale d'acquisto (*Fumetteria*, *Edicola*, *HVC / Preordine*, *Vinted / Usato*, *Ordine Online*, *Fiera / Evento*)
- `notes`: Note su edizioni firmate, sketch, tiratura o commission

### 2. `sales_refunds` (Vendite & Rimborsi - Spesa Netta)
- Ricalca la sezione **"Refound / Vendite"** del file Excel originale:
- Memorizza le vendite di fumetti o lotti su Vinted/Subito/eBay e rimborsi ricevuti.
- **Formula Spesa Netta:** `Spesa Netta Annuale = Spesa Totale Volumi - Totale Vendite/Rimborsi`.

### 3. `orders` (Ordini Store Online)
- Memorizza ordini cumulativi da Libraccio, My Comics, MangaYo, Amazon, Feltrinelli con numero articoli e subtotali.

### 4. `readings` (Diario Letture)
- Ricalca i fogli **"Letture 2026"** e **"Letture 2027"**:
- Traccia i titoli letti mese per mese con categoria (DC, Marvel, Manga, Altro) e valutazione a stelle (1-5).

### 5. `monthly_budgets`
- Tetto massimo di spesa mensile configurabile con monitoraggio in tempo reale della percentuale di utilizzo.

---

## 🔄 Mappatura del Foglio Excel `Fumetti.xlsx`

| Foglio Originale | Mappatura in Comics Count |
| :--- | :--- |
| **2023, 2024, 2025, 2026, 2027** | Colonne DC, Marvel, Manga, Ordini/Vinted ed Eventi mappate con prezzi, date e stati. |
| **Sezione Righe 69+ (Refound)** | Importate nella tabella `sales_refunds` per calcolare la spesa annuale netta esatta. |
| **HVC2026** | Tutti i 98 preordini HoVistoCose importati con canale `HVC / Preordine` e stato `Preordinato`. |
| **Letture 2026 / 2027** | Importati nella sezione Diario Letture. |
| **Ordini** | Importati con suddivisione per negozio (Libraccio, My Comics, MangaYo, Amazon, Feltrinelli). |

---

## 💡 Funzionalità Chiave dell'Interfaccia

1. **Griglia & Schede Visive:**
   - Schede con copertina, badge editore con colore personalizzato, pill variante, prezzo e sconto.
   - Click rapido per cambiare stato (es. da *Da leggere* a *Letto*).
   - Menu contestuale con ricerca copertina, modifica ed eliminazione.
2. **Tabella Contabile (Stile Excel):**
   - Prospetto affiancato per categorie (DC | Marvel | Manga | Ordini | Eventi) con formule di subtotale e totale mensile calcolato al centesimo.
3. **Dashboard Statistiche:**
   - Grafico a barre mensile con confronto Spesa Lorda vs Spesa Netta.
   - Grafico a ciambella (Donut) con percentuale e importi per casa editrice.
   - Confronto storico anno su anno (2023 - 2027).
   - Sezione vendite Vinted con aggiunta rapida.
4. **Modal Inserimento con Ricerca Metadati:**
   - Inserisci Titolo e Numero e clicca su *"Cerca Automaticamente Copertina & Codice a Barre Online"*.
   - Scegli tra le anteprime compatibili trovate per completare la scheda con un solo clic!
5. **Centro Sincronizzazione OneDrive:**
   - Rileva automaticamente `Fumetti.xlsx` in OneDrive.
   - Un clic su *"Sincronizza Ora"* per aggiornare il database senza toccare o rischiare di danneggiare il file originale.
   - Esportazione in nuovo `.xlsx` multi-foglio e backup `.json`.
