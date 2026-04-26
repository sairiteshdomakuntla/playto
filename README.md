# Playto KYC Pipeline

A KYC onboarding service for Playto Pay — merchants submit personal/business details and documents; reviewers approve or reject through an enforced state machine.

## Stack
- **Backend**: Django 4.2 + Django REST Framework + SQLite
- **Frontend**: React 18 + TypeScript + Tailwind CSS v3 + Vite

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+

---

### Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Seed test data (creates 2 merchants + 1 reviewer)
cd ..
python seed.py
cd backend

# Start the Django development server
python manage.py runserver
```

The API is available at **http://localhost:8000/api/v1/**.
The Django admin is at **http://localhost:8000/admin/**.

---

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the Vite dev server (proxies /api → Django :8000)
npm run dev
```

Open **http://localhost:5173** in your browser.

---

### Test credentials (created by seed.py)

| Role     | Username  | Password  | Starting state          |
|----------|-----------|-----------|-------------------------|
| Reviewer | reviewer1 | reviewer1 | —                       |
| Merchant | merchant1 | merchant1 | draft                   |
| Merchant | merchant2 | merchant2 | under_review (SLA risk) |

---

## Running Tests

```bash
cd backend
python manage.py test kyc.tests
```

Tests cover:
- All 6 legal state transitions (unit level)
- All key illegal transitions — approved→draft, rejected→submitted, submitted→approved, etc.
- API-level 400 responses for illegal transitions
- Merchant isolation (merchant B cannot see merchant A's submission)
- File upload validation — oversized file, invalid magic bytes, valid PDF, valid JPEG

---

## API Reference

All endpoints are under `/api/v1/`.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register/` | Create merchant account |
| POST | `/auth/login/` | Get token |
| GET | `/auth/me/` | Current user |

### Merchant
| Method | Path | Description |
|--------|------|-------------|
| GET | `/kyc/submission/` | My submission |
| POST | `/kyc/submission/` | Create draft |
| PATCH | `/kyc/submission/` | Update draft |
| POST | `/kyc/submission/submit/` | Submit for review |
| POST | `/kyc/documents/` | Upload document |

### Reviewer
| Method | Path | Description |
|--------|------|-------------|
| GET | `/reviewer/queue/` | Queue (SLA annotated) |
| GET | `/reviewer/submissions/<id>/` | Full detail |
| PATCH | `/reviewer/submissions/<id>/` | Transition state |
| GET | `/reviewer/metrics/` | Dashboard metrics |

---

## Project Structure

```
playto/
├── backend/
│   ├── kyc/
│   │   ├── state_machine.py   # All state logic lives here
│   │   ├── validators.py      # Magic-byte file validation
│   │   ├── permissions.py     # IsMerchant / IsReviewer
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── signals.py         # Notification events on state change
│   │   └── tests.py
│   ├── notifications/         # NotificationEvent log
│   ├── users/                 # Custom User model + auth views
│   └── playto/                # Django project settings
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── MerchantKYC.tsx
│       │   └── ReviewerDashboard.tsx
│       └── components/
│           └── DocumentUpload.tsx
└── seed.py
```
