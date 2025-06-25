import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';

import './index.css';

import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import Redirector from './pages/Redirector';
import UserList from './pages/AdminPages/UserList';
import OrganizationDashboard from './pages/OrganizationPages/OrganizationDashboard';
import VolunteerDashboard from './pages/VolunteerPages/VolunteerDashboard';
import OpportunitiesPage from './pages/OpportunitiesPage';
import VolunteerProfilePage from './pages/VolunteerPages/VolunteerProfilePage';
import EnquireOpportunities from './pages/VolunteerPages/FindOpportunities/EnquireOpportunities';
import PostOpportunity from './pages/OrganizationPages/PostOpportunities/PostOpportunity';
import EditOpportunity from './pages/OrganizationPages/PostOpportunities/EditOpportunity';
import OrganizationProfilePage from './pages/OrganizationPages/OrganizationProfilePage';
import OpportunityApplicantsPage from './pages/OrganizationPages/PostOpportunities/OpportunityApplicantsPage';
import LookingForVolunteersPage from './pages/OrganizationPages/FindVolunteers/LookingForVolunteers';
import EnquireVolunteerPage from './pages/OrganizationPages/FindVolunteers/EnquireVolunteers';
import SentEnquiriesOrg from './pages/OrganizationPages/FindVolunteers/SentEnquiriesOrg';
import SentEnquiriesVol from './pages/VolunteerPages/FindOpportunities/SentEnquiriesVol';

import Navbar from './components/NavBar';
import Footer from './components/Footer';
import { SessionProvider } from './context/SessionContext';
import ProtectedRoute from './components/ProtectedRoutes';

const queryClient = new QueryClient();


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <div className="flex-grow">
              <Routes>
                {/* Public pages */}
                <Route path="/" element={<HomePage />} />
                <Route path="/opportunities" element={<OpportunitiesPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/redirect" element={<Redirector />} />

                {/* Organisation pages */}
                <Route path="/organization/profile" element={<ProtectedRoute allowedRoles={['organization']}><OrganizationProfilePage /></ProtectedRoute>} />
                <Route path="/organization-dashboard" element={<ProtectedRoute allowedRoles={['organization']}><OrganizationDashboard /></ProtectedRoute>} />
                <Route path="/post-opportunity" element={<ProtectedRoute allowedRoles={['organization']}><PostOpportunity /></ProtectedRoute>} />
                <Route path="/edit-opportunity/:id" element={<ProtectedRoute allowedRoles={['organization']}><EditOpportunity /></ProtectedRoute>} />
                <Route path="/opportunity/:id/applicants" element={<ProtectedRoute allowedRoles={['organization']}><OpportunityApplicantsPage /></ProtectedRoute>} />
                <Route path="/volunteers" element={<ProtectedRoute allowedRoles={['organization']}><LookingForVolunteersPage /></ProtectedRoute>} />
                <Route path="/volunteers/:id/enquire" element={<ProtectedRoute allowedRoles={['organization']}><EnquireVolunteerPage /></ProtectedRoute>} />
                <Route path="/organization/sent-enquiries" element={<ProtectedRoute allowedRoles={['organization']}><SentEnquiriesOrg /></ProtectedRoute>} />

                {/* Volunteer pages */}
                <Route path="/volunteer-dashboard" element={<ProtectedRoute allowedRoles={['volunteer']}><VolunteerDashboard /></ProtectedRoute>} />
                <Route path="/volunteer/profile" element={<ProtectedRoute allowedRoles={['volunteer']}><VolunteerProfilePage /></ProtectedRoute>} />
                <Route path="/opportunities/:id/enquire" element={<ProtectedRoute allowedRoles={['volunteer']}><EnquireOpportunities /></ProtectedRoute>} />
                <Route path="/volunteer/sent-enquiries" element={<ProtectedRoute allowedRoles={['volunteer']}><SentEnquiriesVol /></ProtectedRoute>} />

                {/* Admin pages */}
                <Route path="/users" element={<ProtectedRoute allowedRoles={['admin']}><UserList /></ProtectedRoute>} />

                {/* Catch-all redirect */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            <Footer />
          </div>
        </BrowserRouter>

        <ReactQueryDevtools initialIsOpen={false} />
        <Toaster position="top-right" />
      </SessionProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
