import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'

import AuthPage from './pages/AuthPage'
import Redirector from './pages/Redirector'
import UserList from './pages/AdminPages/UserList'
import OrganizationDashboard from './pages/OrganizationPages/OrganizationDashboard'
import VolunteerDashboard from './pages/VolunteerPages/VolunteerDashboard'
import OpportunitiesPage from './pages/OpportunitiesPage'
import VolunteerProfilePage from './pages/VolunteerPages/VolunteerProfilePage'
import EnquiryPage from './pages/VolunteerPages/EnquiriesPage'
import PostOpportunity from './pages/OrganizationPages/PostOpportunity'
import EditOpportunity from './pages/OrganizationPages/EditOpportunity'
import OrganisationProfilePage from './pages/OrganizationPages/OrganizationProfilePage'

import Navbar from './components/NavBar'


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
          <Route path="/volunteer/profile" element={<VolunteerProfilePage />} />
          <Route path="/opportunities/:id/enquire" element={<EnquiryPage />} />
          <Route path="/post-opportunity" element={<PostOpportunity />} />
          <Route path="/edit-opportunity/:id" element={<EditOpportunity />} />
          <Route path="/organization/profile" element={<OrganisationProfilePage />} />
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
      <Toaster position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>
)
