# HR Management Suite

Single-page HR management web app built with HTML, CSS, JavaScript, Bootstrap 5, Chart.js, and localStorage.

## Features

- Employee CRUD with auto-generated employee IDs
- Attendance logging with late-arrival detection
- Automated salary deductions for attendance, reports, and incomplete tasks
- Task assignment and progress tracking
- Weekly report submission with late penalty logic
- Finance and income tracking with monthly, 4-month, and yearly views
- Budget tracker with over-limit alerts
- Admin login backed by localStorage

## Login

- Email: `admin@hr.local`
- Password: `Admin@123`

## Run

Open the app through a local web server so browser storage works consistently.

Example:

```bash
python -m http.server 3000
```

Then open `http://localhost:3000`.

## Notes

- Data is stored locally in the browser.
- Authentication and persistence are client-side only.