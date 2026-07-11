import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";

import Console from "./pages/Console";
import Admin from "./pages/Admin";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Cookies from "./pages/Cookies";
import Refunds from "./pages/Refunds";
import Contact from "./pages/Contact";
import ErrorPage from "./pages/ErrorPage";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import AdminRoute from "./components/AdminRoute";
import { DbDataProvider } from "./context/DbDataContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { trackSiteVisit } from "./lib/visitTracker";

import './App.css';

const SITE_NAME = "LetsFindPeople";
const SITE_URL = "https://letsfindpeople.com";
const DEFAULT_IMAGE_URL = `${SITE_URL}/preview.png`;

const PAGE_META = {
  "/": {
    title: SITE_NAME,
    description: "Find people who share your interests!",
  },
  "/console": {
    title: SITE_NAME,
    description: "Find people who share your interests!",
  },
  "/auth/callback": {
    title: `${SITE_NAME} | Signing In`,
    description: "Finishing your LetsFindPeople sign in.",
  },
  "/account-deleted": {
    title: `${SITE_NAME} | Account Deleted`,
    description: "Your LetsFindPeople account status page.",
  },
  "/underage-banned": {
    title: `${SITE_NAME} | Account Banned`,
    description: "Your LetsFindPeople account has been banned due to age restriction.",
  },
  "/admin": {
    title: `${SITE_NAME} | Admin`,
    description: "LetsFindPeople administration dashboard.",
  },
  "/privacy": {
    title: `${SITE_NAME} | Privacy`,
    description: "Read the LetsFindPeople privacy policy.",
  },
  "/terms": {
    title: `${SITE_NAME} | Terms`,
    description: "Read the LetsFindPeople terms and conditions.",
  },
  "/cookies": {
    title: `${SITE_NAME} | Cookies`,
    description: "Read the LetsFindPeople cookie policy.",
  },
  "/refunds": {
    title: `${SITE_NAME} | Refunds`,
    description: "Read the LetsFindPeople refunds policy.",
  },
  "/contact": {
    title: `${SITE_NAME} | Contact`,
    description: "Contact LetsFindPeople for questions and support.",
  },
};

function setMetaTag(selector, attribute, value) {
  let tag = document.head.querySelector(selector);

  if (!tag) {
    tag = document.createElement("meta");
    const match = selector.match(/\[(name|property)="([^"]+)"\]/);

    if (match) {
      tag.setAttribute(match[1], match[2]);
    }

    document.head.appendChild(tag);
  }

  tag.setAttribute(attribute, value);
}

function setLinkTag(selector, rel, href) {
  let tag = document.head.querySelector(selector);

  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }

  tag.setAttribute("href", href);
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  return null;
}

function HeadManager() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] || {
    title: `${SITE_NAME} | Page Not Found`,
    description: "The page you are looking for could not be found on LetsFindPeople.",
  };
  const pageUrl = new URL(pathname, SITE_URL).toString();

  useEffect(() => {
    document.title = meta.title;
    setMetaTag('meta[name="description"]', "content", meta.description);
    setMetaTag('meta[property="og:title"]', "content", meta.title);
    setMetaTag('meta[property="og:description"]', "content", meta.description);
    setMetaTag('meta[property="og:image"]', "content", DEFAULT_IMAGE_URL);
    setMetaTag('meta[property="og:url"]', "content", pageUrl);
    setMetaTag('meta[property="og:type"]', "content", "website");
    setLinkTag('link[rel="canonical"]', "canonical", pageUrl);
  }, [meta.description, meta.title, pageUrl]);

  return null;
}

function SiteVisitTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    trackSiteVisit(pathname);
  }, [pathname]);

  return null;
}

function AuthRedirectHandler() {
  const { session, isLoading, isAdmin, authBlockReason } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hasAuthHash = window.location.hash.includes("access_token=");
    const isAuthCallback = location.pathname === "/auth/callback" || hasAuthHash;

    if (!isAuthCallback || isLoading) return;

    if (authBlockReason === "accountDeleted") {
      navigate("/account-deleted", { replace: true });
      return;
    }

    if (authBlockReason === "underageBanned") {
      navigate("/underage-banned", { replace: true });
      return;
    }

    if (!session) return;

    navigate(isAdmin ? "/admin" : "/", { replace: true });
  }, [authBlockReason, isAdmin, isLoading, location.pathname, navigate, session]);

  useEffect(() => {
    if (isLoading || !session || !isAdmin) return;
    if (location.pathname !== "/" && location.pathname !== "/console") return;

    navigate("/admin", { replace: true });
  }, [isAdmin, isLoading, location.pathname, navigate, session]);

  return null;
}

function AuthCallback() {
  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
      <div className="spinner-border spinner-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
}

function AppFrame({ savedProfile, setSavedProfile }) {
  const { pathname } = useLocation();
  const isAdminPage = pathname === "/admin";

  return (
    <div className={`app-wrapper ${isAdminPage ? "app-wrapper--admin" : ""}`}>
      <Navbar onProfileSave={setSavedProfile} />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Console currentUser={savedProfile} />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/account-deleted" element={<ErrorPage type="accountDeleted" />} />
          <Route path="/underage-banned" element={<ErrorPage type="underageBanned" />} />
          <Route path="/console" element={<Console currentUser={savedProfile} />} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<ErrorPage type="notFound" />} />
        </Routes>
      </main>
      {!isAdminPage && <Footer />}
    </div>
  );
}

function App() {
  const [savedProfile, setSavedProfile] = useState(null);

  return (
    <AuthProvider>
      <DbDataProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <HeadManager />
          <ScrollToTop />
          <SiteVisitTracker />
          <AuthRedirectHandler />
          <AppFrame savedProfile={savedProfile} setSavedProfile={setSavedProfile} />
        </BrowserRouter>
      </DbDataProvider>
    </AuthProvider>
  );
}

export default App;
