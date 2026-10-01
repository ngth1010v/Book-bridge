<div align="center">

# BookBridge

**Keep students learning while the textbooks are still on their way.**

No photocopying. No extra cost for parents. Ends when the official books arrive.

<br>

<a href="https://ngth1010v.github.io/Book-bridge/index.en.html"><img alt="Open the live site" src="https://img.shields.io/badge/Open_the_live_site-ngth1010v.github.io%2FBook--bridge-0369a1?style=for-the-badge&logo=githubpages&logoColor=white"></a>

<a href="https://ngth1010v.github.io/Book-bridge/app.html?lang=en"><img alt="Try the demo app" src="https://img.shields.io/badge/Try_the_demo_app-0f172a?style=for-the-badge"></a>
<a href="https://ngth1010v.github.io/Book-bridge/index.en.html"><img alt="Read the report" src="https://img.shields.io/badge/Read_the_report-475569?style=for-the-badge"></a>
<a href="https://ngth1010v.github.io/Book-bridge/index.html"><img alt="Tiếng Việt" src="https://img.shields.io/badge/Ti%E1%BA%BFng_Vi%E1%BB%87t-475569?style=for-the-badge"></a>

<br>

![Languages](https://img.shields.io/badge/languages-English_%7C_Ti%E1%BA%BFng_Vi%E1%BB%87t-0369a1)
![No build step](https://img.shields.io/badge/build_step-none-166534)
![Dependencies](https://img.shields.io/badge/dependencies-0-166534)
![Licence](https://img.shields.io/badge/licence-Unlicense-475569)

</div>

---

## What it is

In September 2026, schools across Vietnam started the year millions of textbook copies short. The books did arrive, but for weeks some schools had spare copies while the school next door had none, and parents had no way to know when their child's books would come.

BookBridge is a two-part answer:

| | |
| --- | --- |
| **In the classroom** | Share the copies a class already has, pair students up, and use teacher-made worksheets. No technology needed. |
| **A small web app** | Schools report what they need and have. The app matches spare books to shortages, suppliers see where to deliver, and parents see when books will arrive. |

The app never stores textbook content. It only tracks how many legally printed copies exist and where they move.

> The data in the demo is sample data. School and supplier names are fictional.

## See it in action

### A school that is short asks another school for spare books

Anh Duong Primary is short of Math 1 and Sao Mai Primary has spare copies. The two schools agree in the app and both stock counts update.

![Transferring spare books between two schools](demo/transfer.gif)

### A parent checks the books and signs up for a loan

A parent sees which titles are complete, on the way or short, then signs up to borrow a copy in turn.

![A parent signing up for a rotating loan](demo/parent.gif)

### A supplier schedules a delivery

A supplier sees where books are still missing, creates a delivery and updates its status.

![A supplier creating a delivery](demo/supplier.gif)

## Run it locally

You only need Python 3. There is nothing to install.

<table>
<tr>
<th width="50%">Static site</th>
<th width="50%">With the backend</th>
</tr>
<tr>
<td>

Same as the live site. Data lives in the browser's `localStorage`, seeded from `seed.json`.

```bash
# Windows, opens the browser for you
run.bat

# any other system
python -m http.server 8000
```

</td>
<td>

Data lives in SQLite (`data.db`), so several machines can share it.

```bash
# Windows, opens the browser for you
run.bat backend-enable

# any other system
python server.py
```

</td>
</tr>
</table>

Then open http://localhost:8000. The app detects the backend and switches to the API on its own.

- **Reload the sample data:** delete `data.db`.
- **Let other machines connect:** set `BOOKBRIDGE_HOST=0.0.0.0`. The backend has no sign-in yet, so use it on a trusted network only.

## Tests

```bash
node logic.test.js      # shortage, surplus and transfer-suggestion logic
node i18n.test.js       # every app string has an English translation
python test_server.py   # API
```

## Project layout

| File | What it is |
| --- | --- |
| `index.html`, `index.en.html` | The report, in Vietnamese and English |
| `app.html`, `app.js` | The app for schools, parents and suppliers |
| `i18n.js` | English text for the app |
| `logic.js` | Pure functions: shortage, surplus, incoming, transfer suggestions |
| `styles.css` | Shared styles |
| `seed.json` | Sample data |
| `server.py` | Optional backend (Python standard library + SQLite) |

Plain HTML, CSS and JavaScript. No framework, no build step, no npm.

## Credits

- **Code:** released into the public domain, see [`LICENSE`](LICENSE).
- **Photo** `classroom.jpg`: [“Classroom in Vietnam”](https://commons.wikimedia.org/wiki/File:Classroom_in_Vietnam_(cropped).jpg) by Phat14082005, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), resized.
- **Textbooks:** the repository contains no textbook content. E-textbooks are only linked at their official source.
