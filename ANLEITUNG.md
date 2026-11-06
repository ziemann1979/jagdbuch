# Jagdbuch – Anleitung

## Was ist das?
Eine Web-App, die du wie eine normale App vom Home-Bildschirm deines iPhones startest.
**Alle Jagddaten (Abschüsse, Sichtungen, Ansitze, Hochsitze, Fotos) liegen nur auf dem iPhone.**
Es gibt keinen Server, kein Konto und keine Cloud. Aus dem Internet geladen werden nur die
App-Dateien (einmalig) und die Kartenbilder.

## 1. Einmalig: App ins Internet stellen (kostenlos, ca. 10 Minuten)
Das iPhone braucht eine https-Adresse, damit GPS und Installation funktionieren.
Auf dieser Adresse liegt nur der Programmcode – **keine deiner Daten**.

**Empfohlen: GitHub Pages**
1. Auf https://github.com ein kostenloses Konto anlegen.
2. Oben rechts auf **+ → New repository** klicken, Name z. B. `jagdbuch`, auf **Public** stellen, dann **Create repository**.
3. Auf **uploading an existing file** klicken und den **Inhalt** dieses Ordners hineinziehen
   (index.html, app.js, styles.css, sw.js, manifest.webmanifest sowie die Ordner `lib` und `icons`), dann **Commit changes**.
4. **Settings → Pages**: Bei Source **Deploy from a branch** wählen, dann Branch `main` und `/ (root)` → **Save**.
5. Nach 1–2 Minuten ist die App erreichbar unter `https://DEINNAME.github.io/jagdbuch/`

⚠️ **Diese Adresse nie wieder ändern.** Das iPhone ordnet die Daten der Adresse zu.

## 2. Auf dem iPhone installieren
1. Die Adresse in **Safari** öffnen (nicht in Chrome).
2. Auf **Teilen** (Quadrat mit Pfeil) und dann **Zum Home-Bildschirm** tippen.
3. Die App **nur noch über das Icon** starten. Daten im Safari-Tab und in der App sind getrennt!
4. Beim ersten GPS-Zugriff **Erlauben** antippen.

## 3. Bedienung
- **Karte**: Lange auf eine Stelle drücken → Hochsitz, Abschuss oder Sichtung genau dort anlegen.
  Mit **＋** wird die aktuelle GPS-Position verwendet. Mit 🗺️ schaltest du die Kartenart um (Satellit, Satellit mit Namen, topografisch, Straßenkarte), mit 👁️ blendest du Inhalte ein und aus.
- **Ansitz**: Mit **Ansitz starten** wählst du den Hochsitz (der nächstgelegene wird vorgeschlagen).
  Danach erfasst du Sichtungen mit den Schnelltasten (1 Antippen = 1 Stück, über **Details** kannst du sie ergänzen).
  Ein **Abschuss** wird automatisch dem Ansitz, dem Hochsitz und dem Revier zugeordnet.
- **Strecke**: Alle Abschüsse, filterbar nach Jagdjahr, Wildart und Revier, mit Summen.
- **Mehr**: Reviere (auch im Ausland), Wildarten verwalten (★ = Schnelltaste), Datensicherung, Offline-Karte.

## 4. Datensicherung & neues iPhone ⚠️ wichtig
- **Mehr → Sicherung erstellen** erzeugt eine Datei mit *allen* Daten inklusive Fotos.
  Speichere sie mit **In „Dateien“ sichern** in iCloud Drive oder auf „Auf meinem iPhone“.
- Die App erinnert dich, wenn die letzte Sicherung älter als 14 Tage ist.
- **Neues iPhone:** Sicherung erstellen und per AirDrop oder iCloud Drive aufs neue iPhone bringen.
  Dort die App wie oben installieren, dann **Mehr → Sicherung einspielen → Alles ersetzen**.
- Verlass dich **nicht** darauf, dass ein iCloud-Backup oder der iPhone-Umzug die App-Daten mitnimmt.
  Die Sicherungsdatei ist der einzige verlässliche Weg.

## 5. Fotos
Fotos wählst du aus deiner Mediathek oder nimmst sie direkt auf. Die App speichert eine
verkleinerte Kopie (ca. 200–400 KB). Ein reiner Verweis auf das Original in der Fotos-App ist mit
einer Web-App technisch nicht möglich. Bei einem Gerätewechsel würde so ein Verweis ohnehin
ins Leere zeigen. So wandern die Fotos sicher im Backup mit, und die Originale bleiben unverändert in deiner Fotos-App.

## 6. Ohne Netz (Ausland, Funkloch)
- Die App selbst läuft nach dem ersten Öffnen auch offline. Erfassen geht immer.
- Kartenbilder: Angesehene Bereiche werden automatisch gespeichert. Vor einer Reise
  (z. B. Namibia, Belarus) das Gebiet im WLAN auf der Karte heranzoomen und dann
  **Mehr → Sichtbaren Kartenausschnitt speichern** antippen.

## Updates
Neue Versionen lädst du einfach wieder in dasselbe GitHub-Repository hoch. Deine Daten bleiben dabei erhalten.
Vorher sicherheitshalber eine Sicherung erstellen.
