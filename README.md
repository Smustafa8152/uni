# University Management System

A modern, full-featured university management system built with React, Vite, Tailwind CSS, and Supabase.

## Features

- 🔐 **Authentication**: Secure login and signup with Supabase Auth
- 👥 **Student Management**: Complete student records and information management
- 👨‍🏫 **Instructor Management**: Manage instructor profiles and information
- 📚 **Course Management**: Handle courses, subjects, and class schedules
- 📅 **Schedule Management**: View and manage class schedules
- 📝 **Examinations**: Schedule and manage examinations and assessments
- ⚙️ **Settings**: User preferences and system configuration
- 🎨 **Modern UI**: Beautiful, responsive design with Tailwind CSS
 
## Tech Stack

- **Frontend**: React 19, Vite
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Routing**: React Router DOM
- **Icons**: Lucide React

## Prerequisites

- Node.js 18+ and npm
- Supabase account and project

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Note:** The service role key is needed for the automated test user setup script.

### 3. Supabase Setup

The project is already linked to your Supabase instance. The database migrations have been applied.

To verify the connection:
```bash
npx supabase status
```

### 4. Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Project Structure

```
src/
├── components/      # Reusable components (Layout, ProtectedRoute)
├── contexts/        # React contexts (AuthContext)
├── lib/            # Utility libraries (Supabase client)
├── pages/          # Page components
│   ├── Login.jsx
│   ├── Signup.jsx
│   ├── Dashboard.jsx
│   ├── Students.jsx
│   ├── Instructors.jsx
│   ├── Courses.jsx
│   ├── Schedule.jsx
│   ├── Examinations.jsx
│   └── Settings.jsx
├── App.jsx         # Main app component with routing
└── main.jsx        # Entry point
```

## Database Schema

The database includes the following main entities:

- **Colleges**: University/college information
- **Users**: Authentication and user management
- **Students**: Student records and academic information
- **Instructors**: Instructor profiles and details
- **Faculties**: Faculty/department structure
- **Departments**: Department information
- **Majors**: Academic programs
- **Subjects**: Course subjects
- **Classes**: Class instances
- **Enrollments**: Student class enrollments
- **Examinations**: Exam scheduling and management
- **Attendance**: Class attendance tracking
- **Financial Transactions**: Student financial records

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run setup:users` - Create test users automatically (requires service role key)

## Quick Setup Test Users

See `QUICK_SETUP.md` for one-command test user setup, or `TEST_USERS.md` for detailed instructions.

## Supabase CLI Commands

- `npx supabase status` - Check Supabase connection status
- `npx supabase db push` - Push local migrations to remote
- `npx supabase db pull` - Pull remote migrations to local
- `npx supabase migration list` - List all migrations

## License

MIT
