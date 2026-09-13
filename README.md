# LetsFindPeople

**LetsFindPeople** is a web application that enables searching and discovering people using customizable search filters, built with React, Vite, Bootstrap, and Supabase.

---

## 🚀 Features

- **People Search Console**: Interactive console to query and filter people records (`/console`).
- **Admin Dashboard**: Comprehensive administration panel for managing application state (`/admin`).
- **Supabase Backend**: Authentication, database queries, and edge function integrations.
- **Analytics & Visit Tracking**: Built-in site visit logging and metrics visualization with Chart.js.
- **Responsive Layout**: Styled with Bootstrap for dynamic desktop and mobile experiences.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, React Router 7, Bootstrap 5, Chart.js
- **Backend / Database**: Supabase (`@supabase/supabase-js`, Deno Edge Functions)
- **Deployment**: Vercel (`vercel.json` configured for spa routing)

---

## 📁 Project Structure

```text
letsfindpeople/
├── frontend/             # React + Vite web application
│   ├── src/              # Pages, components, contexts, and utils
│   ├── .env.example      # Example environment variables
│   └── package.json      # Dependencies and build scripts
├── supabase/             # Supabase configuration & Edge Functions
├── vercel.json           # Vercel deployment & rewrite configuration
└── README.md             # Project documentation
```

---

## ⚙️ Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/)

### 2. Environment Setup

Create a `.env` file inside the `frontend/` directory by copying `.env.example`:

```bash
cp frontend/.env.example frontend/.env
```

Configure your environment variables in `frontend/.env`:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_SITE_URL=http://localhost:5173
```

> ⚠️ **Important**: Never commit actual API keys or secrets to git repositories.

### 3. Installation

Navigate to the `frontend` directory and install dependencies:

```bash
cd frontend
npm install
```

### 4. Running Locally

Start the Vite development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to view the application.

---

## 📦 Build & Deployment

To create a production build:

```bash
cd frontend
npm run build
```

The output will be placed in `frontend/dist`. The project is configured for single-page app deployment on platforms like Vercel.