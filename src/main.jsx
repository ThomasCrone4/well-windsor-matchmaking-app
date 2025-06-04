import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import AuthPage from './pages/AuthPage'
import Redirector from './pages/Redirector'

function VolunteerDashboard() {
  return <h1 className="text-center mt-20 text-3xl">Volunteer Dashboard</h1>
}

function OrganizationDashboard() {
  return <h1 className="text-center mt-20 text-3xl">Organization Dashboard</h1>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Redirector />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/volunteer-dashboard" element={<VolunteerDashboard />} />
        <Route path="/organization-dashboard" element={<OrganizationDashboard />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
