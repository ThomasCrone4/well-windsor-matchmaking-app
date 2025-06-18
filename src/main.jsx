import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';

import './index.css';

import AuthPage from './pages/AuthPage';
import Redirector from './pages/Redirector';
import UserList from './pages/AdminPages/UserList';
import OrganizationDashboard from './pages/OrganizationPages/OrganizationDashboard';
import VolunteerDashboard from './pages/VolunteerPages/VolunteerDashboard';
import OpportunitiesPage from './pages/OpportunitiesPage';
import VolunteerProfilePage from './pages/VolunteerPages/VolunteerProfilePage';
import EnquireOpportunities from './pages/VolunteerPages/EnquireOpportunities';
import PostOpportunity from './pages/OrganizationPages/PostOpportunity';
import EditOpportunity from './pages/OrganizationPages/EditOpportunity';
import OrganizationProfilePage from './pages/OrganizationPages/OrganizationProfilePage';
import OpportunityApplicantsPage from './pages/OrganizationPages/OpportunityApplicantsPage';
import LookingForVolunteersPage from './pages/OrganizationPages/LookingForVolunteers';
import EnquireVolunteerPage from './pages/OrganizationPages/EnquireVolunteers';

import Navbar from './components/NavBar';
import Footer from './components/Footer';
import { SessionProvider } from './context/SessionContext';

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
                <Route path="/" element={<OpportunitiesPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/redirect" element={<Redirector />} />
                <Route path="/volunteer-dashboard" element={<VolunteerDashboard />} />
                <Route path="/organization-dashboard" element={<OrganizationDashboard />} />
                <Route path="/users" element={<UserList />} />
                <Route path="/opportunities" element={<OpportunitiesPage />} />
                <Route path="/volunteer/profile" element={<VolunteerProfilePage />} />
                <Route path="/opportunities/:id/enquire" element={<EnquireOpportunities />} />
                <Route path="/post-opportunity" element={<PostOpportunity />} />
                <Route path="/edit-opportunity/:id" element={<EditOpportunity />} />
                <Route path="/organization/profile" element={<OrganizationProfilePage />} />
                <Route path="/opportunity/:id/applicants" element={<OpportunityApplicantsPage />} />
                <Route path="/volunteers" element={<LookingForVolunteersPage />} />
                <Route path="/volunteers/:id/enquire" element={<EnquireVolunteerPage />} />
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
