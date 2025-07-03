
# 🛠️ Project Setup – Well Windsor Volunteer Matchmaking App

This document will walk you through installing and running the app locally.

---

## 🧰 Prerequisites

Before running the app, make sure you have the following installed on your machine:

| Tool | Version | Install Link |
|------|---------|--------------|
| **Node.js** | 18.x or later | [Download Node.js](https://nodejs.org/en/download) |
| **npm** | 9.x or later (comes with Node) | Included |
| **Git** | Any recent version | [Download Git](https://git-scm.com/downloads) |
| **VS Code** (optional but recommended) | — | [Download VS Code](https://code.visualstudio.com/) |

---

## 🧾 Step 1 – Clone the Repository

```bash
git clone https://github.com/wellwindsor/volunteer-matchmaking.git
cd volunteer-matchmaking
```

---

## 📦 Step 2 – Install Node Dependencies

```bash
npm install
```

This will install everything listed in `package.json`, including:

- React 19
- Vite
- Supabase JS v2
- Tailwind CSS
- React Hook Form + Zod
- React Query v5
- react-hot-toast
- date-fns, lucide-react, react-icons

---

## 🔐 Step 3 – Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` and insert your Supabase project credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-api-key
```

You can find these in your [Supabase project dashboard](https://app.supabase.com/project/_/settings/api).

---

## 🧪 Step 4 – Run the Development Server

```bash
npm run dev
```

Your app will now be live at:

```
http://localhost:5173
```

---

## 🧰 Optional Tools

If you want to work with Supabase migrations locally:

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-id
```

Then run `supabase db dump` to export your current schema.

---

## 🧼 Cleanup and Linting

To lint the code (optional):

```bash
npm run lint
```

---

## 📁 File Structure (Simplified)

```
/src
  /components           # Shared UI components like WorkedMatrix
  /pages
    /volunteer          # Volunteer dashboard, log hours, etc.
    /organization       # Org dashboard, opportunities, etc.
    /admin              # Admin functionality (WIP)
  /utils/supabase.js    # Supabase client instance
.env.local              # Supabase keys (do NOT commit)
package.json
tailwind.config.js
vite.config.js
```

---

## 🧪 Troubleshooting Tips

- ❌ 403 Forbidden from Supabase:
  - Check your Supabase Row Level Security (RLS) policies
  - Ensure your `auth.uid()` logic allows correct roles to update/view

- ⚠️ "No hours logged":
  - Ensure `applications` table has matching `volunteer_id` entries
  - Confirm that the foreign keys are correct in Supabase relationships

- 💡 Need help? Ping your developer contact or check the Supabase docs at [supabase.com/docs](https://supabase.com/docs)
