import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'

import AuthPage from './pages/AuthPage'
import Redirector from './pages/Redirector'
import UserList from './pages/UserList'
import OrganizationDashboard from './pages/OrganizationDashboard'
import OpportunitiesPage from './pages/OpportunitiesPage'

import Navbar from './components/NavBar'

function VolunteerDashboard() {
  return <h1 className="text-center mt-20 text-3xl">Volunteer Dashboard</h1>
}

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<OpportunitiesPage />} /> {/* ✅ New homepage */}
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/redirect" element={<Redirector />} /> {/* ✅ Moved redirect logic here */}
          <Route path="/volunteer-dashboard" element={<VolunteerDashboard />} />
          <Route path="/organization-dashboard" element={<OrganizationDashboard />} />
          <Route path="/users" element={<UserList />} />
          <Route path="/opportunities" element={<OpportunitiesPage />} />
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
      <Toaster position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>
)
