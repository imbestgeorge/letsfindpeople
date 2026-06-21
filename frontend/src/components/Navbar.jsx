import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import defaultProfile from "../assets/default-profile.jpg";
import { useDbData } from "../context/DbDataContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { updateUserProfile, deleteUser, getUserProfile, uploadProfilePicture } from "../lib/userService";
import { requestKeyword } from "../lib/catalogService";
import {
  CHAT_MAX_MESSAGE_LENGTH,
  getUnreadGlobalChatMessageCount,
  listGlobalChatMessages,
  markGlobalChatMessagesRead,
  removeGlobalChatSubscription,
  sendGlobalChatMessage,
  subscribeToGlobalChatMessages,
} from "../lib/chatService";
import { buildInviteUrl, getInviteCodeFromSearch, storePendingInviteCode } from "../lib/inviteService";
import { getMyProfileAnalytics } from "../lib/analyticsService";
import {
  getOrCreateDrawEventInvite,
  getUnreadSiteNotificationCount,
  listSiteNotifications,
  markSiteNotificationRead,
  OPEN_SITE_NOTIFICATION_EVENT,
  removeSiteNotificationSubscription,
  subscribeToSiteNotifications,
} from "../lib/notificationService";

import "./Navbar.css";

const GENDER_KEYWORDS = ["Male", "Female", "Other"];
const DRAW_INVITE_SHARE_TITLE = "LetsFindPeople";
const PROFILE_YES_NO_KEYS = [
  "visualArt",
  "listenMusic",
  "produceMusic",
  "likeAnime",
  "likeGames",
  "likeProgramming",
  "attendEducation",
  "goGym",
];
const PROFILE_DIRECT_KEYS = [
  "movies",
  "tvShows",
  "personality",
  "hobbies",
  "roleModels",
  "other",
];
const PROFILE_SELECTOR_KEYS = [
  "visualArt",
  "digitalArt",
  "designSoft",
  "musicGenres",
  "musicArtists",
  "musicSoft",
  "instruments",
  "movies",
  "tvShows",
  "anime",
  "games",
  "progLang",
  "subjects",
  "personality",
  "hobbies",
  "fitness",
  "sports",
  "outdoor",
  "places",
  "roleModels",
  "other",
];
const GBP_COUNTRIES = new Set(["GB", "UK", "UNITED KINGDOM", "ENGLAND", "SCOTLAND", "WALES", "NORTHERN IRELAND"]);
const EUROPE_COUNTRIES = new Set([
  "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IS", "IE", "IT", "XK", "LV", "LI", "LT", "LU", "MT", "MD", "MC",
  "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI", "ES", "SE",
  "CH", "UA", "VA",
  "ALBANIA", "ANDORRA", "AUSTRIA", "BELARUS", "BELGIUM", "BOSNIA AND HERZEGOVINA",
  "BULGARIA", "CROATIA", "CYPRUS", "CZECHIA", "CZECH REPUBLIC", "DENMARK", "ESTONIA",
  "FINLAND", "FRANCE", "GERMANY", "GREECE", "HUNGARY", "ICELAND", "IRELAND", "ITALY",
  "KOSOVO", "LATVIA", "LIECHTENSTEIN", "LITHUANIA", "LUXEMBOURG", "MALTA", "MOLDOVA",
  "MONACO", "MONTENEGRO", "NETHERLANDS", "NORTH MACEDONIA", "NORWAY", "POLAND",
  "PORTUGAL", "ROMANIA", "RUSSIA", "SAN MARINO", "SERBIA", "SLOVAKIA", "SLOVENIA",
  "SPAIN", "SWEDEN", "SWITZERLAND", "UKRAINE", "VATICAN CITY",
]);

function normalizeCountry(value) {
  return String(value || "").trim().toUpperCase();
}

function getBrowserCountryCode() {
  try {
    return normalizeCountry(new Intl.Locale(navigator.language).region);
  } catch {
    return "";
  }
}

function getBasicPlanPrice(location) {
  const locationParts = String(location || "")
    .split(",")
    .map(normalizeCountry)
    .filter(Boolean);
  const countryCandidates = [...locationParts, getBrowserCountryCode()];

  if (countryCandidates.some(country => GBP_COUNTRIES.has(country))) return "£2.99";
  if (countryCandidates.some(country => EUROPE_COUNTRIES.has(country))) return "€2.99";
  return "$2.99";
}

async function getFunctionErrorMessage(error, data, fallback) {
  if (data?.error) return data.error;

  try {
    if (error?.context?.headers?.get("content-type")?.includes("application/json")) {
      const body = await error.context.json();
      if (body?.error) return body.error;
    }
  } catch {
    // Fall through to the generic error message.
  }

  return error?.message || fallback;
}

function formatStripeDate(unixSeconds) {
  if (!unixSeconds) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(unixSeconds * 1000));
}

function formatChatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getChatAuthorName(message) {
  const name = `${message.author?.firstName || ""} ${message.author?.lastName || ""}`.trim();
  return name || message.author?.email || "Member";
}

function formatNotificationTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatAnalyticsViewTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function buildDrawInviteShareMessage() {
  return "What if someone exactly like you already exists 🤔? Find out on https://letsfindpeople.com";
}

async function copyTextToClipboard(text) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path below.
  }

  if (typeof document === "undefined" || !document.body) return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function combineAnswers(...answers) {
  if (answers.includes("yes")) return "yes";
  if (answers.includes("no")) return "no";
  return null;
}

function formatBirthDatePart(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number).padStart(2, "0") : "";
}

function getSelectedGender(selected) {
  return GENDER_KEYWORDS.find(name => (selected?.other || []).includes(name)) || "";
}

function getMatchingCountryNames(location, countryItems) {
  const locationParts = String(location || "")
    .split(",")
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);

  if (locationParts.length === 0) return [];

  return countryItems
    .filter(item => locationParts.some(part => part === item.name.toLowerCase()))
    .map(item => item.name);
}

function getOtherInterestNames(selected, selectedGender, countryNames) {
  const hiddenNames = new Set(countryNames);
  if (selectedGender) hiddenNames.add(selectedGender);

  const names = new Set();
  Object.values(selected || {}).forEach(values => {
    if (!Array.isArray(values)) return;
    values.forEach(name => {
      if (!hiddenNames.has(name)) names.add(name);
    });
  });

  return [...names];
}

function isDirectQuestionComplete(selected, skipped, key, selectedGender, countryNames) {
  if (key === "other") {
    return getOtherInterestNames(selected, selectedGender, countryNames).length > 0 || !!skipped?.other;
  }

  return (selected?.[key]?.length > 0) || !!skipped?.[key];
}

function pickKeys(source, keys) {
  const next = {};
  for (const key of keys) {
    if (source?.[key] != null) next[key] = source[key];
  }
  return next;
}

function sanitizeSelectedForProfile(selected, selectedGender, countryNames) {
  const countryNameSet = new Set(countryNames);
  const next = {};

  for (const key of PROFILE_SELECTOR_KEYS) {
    const values = Array.isArray(selected?.[key]) ? selected[key] : [];

    if (key === "other") {
      const cleaned = values.filter(name =>
        !countryNameSet.has(name) &&
        (!GENDER_KEYWORDS.includes(name) || name === selectedGender)
      );
      if (selectedGender && !cleaned.includes(selectedGender)) {
        cleaned.push(selectedGender);
      }
      if (cleaned.length > 0) next.other = cleaned;
      continue;
    }

    if (key === "places") {
      if (countryNames.length > 0) next.places = [...countryNames];
      continue;
    }

    if (values.length > 0) next[key] = values;
  }

  if (!next.other && selectedGender) {
    next.other = [selectedGender];
  }

  return next;
}

function Navbar({ onProfileSave }) {
  const { dbData, isLoading: catalogLoading } = useDbData();
  const { session, isAdmin, isLoading: authLoading } = useAuth();
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const loginDropdownRef = useRef(null);
  const loginDropdownToggleRef = useRef(null);
  const loginDropdownMenuRef = useRef(null);
  const pricingDropdownRef = useRef(null);
  const pricingDropdownToggleRef = useRef(null);
  const pricingDropdownMenuRef = useRef(null);
  const notificationsDropdownRef = useRef(null);
  const notificationsDropdownMenuRef = useRef(null);
  const contactErrorRef = useRef(null);
  const chatMessagesBodyRef = useRef(null);
  const inviteAuthOpenedRef = useRef("");

  const [keywordRequestStatuses, setKeywordRequestStatuses] = useState({});

  // ── Derive item lists from catalog (all empty until catalog loads) ─────────
  const visualArtItems = useMemo(() => dbData?.categories[0]?.subcategories[0]?.items ?? [], [dbData]);
  const digitalArtItems = useMemo(() => dbData?.categories[0]?.subcategories[1]?.items ?? [], [dbData]);
  const musicItems = useMemo(() => dbData?.categories[0]?.subcategories[2]?.items ?? [], [dbData]);
  const musicGenreItems = useMemo(() => musicItems.filter(i => i.id <= 280), [musicItems]);
  const instrumentItems = useMemo(() => musicItems.filter(i => i.id >= 281 && i.id <= 389), [musicItems]);
  const musicArtistItems = useMemo(() => musicItems.filter(i => i.id >= 390), [musicItems]);
  const performItems = useMemo(() => dbData?.categories[0]?.subcategories[3]?.items ?? [], [dbData]);
  const writingItems = useMemo(() => dbData?.categories[0]?.subcategories[4]?.items ?? [], [dbData]);
  const movieItems = useMemo(() => dbData?.categories[1]?.subcategories[0]?.items ?? [], [dbData]);
  const tvShowItems = useMemo(() => dbData?.categories[1]?.subcategories[1]?.items ?? [], [dbData]);
  const animeItems = useMemo(() => dbData?.categories[1]?.subcategories[2]?.items ?? [], [dbData]);
  const gamingItems = useMemo(() => dbData?.categories[1]?.subcategories[4]?.items ?? [], [dbData]);
  const memeItems = useMemo(() => dbData?.categories[1]?.subcategories[6]?.items ?? [], [dbData]);
  const deviceItems = useMemo(() => dbData?.categories[2]?.subcategories[0]?.items ?? [], [dbData]);
  const appItems = useMemo(() => dbData?.categories[2]?.subcategories[1]?.items ?? [], [dbData]);
  const designSoftItems = useMemo(() => dbData?.categories[2]?.subcategories[2]?.items ?? [], [dbData]);
  const musicSoftItems = useMemo(() => dbData?.categories[2]?.subcategories[3]?.items ?? [], [dbData]);
  const progLangItems = useMemo(() => [
    ...(dbData?.categories[2]?.subcategories[5]?.items ?? []),
    ...(dbData?.categories[2]?.subcategories[4]?.items ?? []),
  ], [dbData]);
  const aiItems = useMemo(() => dbData?.categories[2]?.subcategories[6]?.items ?? [], [dbData]);
  const subjectItems = useMemo(() => dbData?.categories[3]?.subcategories[0]?.items ?? [], [dbData]);
  const careerItems = useMemo(() => dbData?.categories[3]?.subcategories[3]?.items ?? [], [dbData]);
  const personalityItems = useMemo(() => dbData?.categories[4]?.subcategories[0]?.items ?? [], [dbData]);
  const hobbyItems = useMemo(() => [
    ...(dbData?.categories[4]?.subcategories[7]?.items ?? []),
    ...(dbData?.categories[4]?.subcategories[6]?.items ?? []),
  ], [dbData]);
  const sexualityItems = useMemo(() => dbData?.categories[4]?.subcategories[3]?.items ?? [], [dbData]);
  const sportsItems = useMemo(() => dbData?.categories[5]?.subcategories[0]?.items ?? [], [dbData]);
  const fitnessItems = useMemo(() => dbData?.categories[5]?.subcategories[1]?.items ?? [], [dbData]);
  const outdoorItems = useMemo(() => dbData?.categories[5]?.subcategories[2]?.items ?? [], [dbData]);
  const foodItems = useMemo(() => [
    ...(dbData?.categories[6]?.subcategories[0]?.items ?? []),
    ...(dbData?.categories[6]?.subcategories[1]?.items ?? []),
    ...(dbData?.categories[6]?.subcategories[2]?.items ?? []),
    ...(dbData?.categories[6]?.subcategories[3]?.items ?? []),
  ], [dbData]);
  const countryItems = useMemo(() => dbData?.categories[7]?.subcategories[0]?.items ?? [], [dbData]);
  const cityItems = useMemo(() => dbData?.categories[7]?.subcategories[1]?.items ?? [], [dbData]);
  const placeItems = useMemo(() => [
    ...countryItems,
    ...cityItems,
    ...(dbData?.categories[7]?.subcategories[2]?.items ?? []),
  ], [dbData, countryItems, cityItems]);
  const animalItems = useMemo(() => dbData?.categories[7]?.subcategories[3]?.items ?? [], [dbData]);
  const vehicleItems = useMemo(() => [
    ...(dbData?.categories[8]?.subcategories[0]?.items ?? []),
    ...(dbData?.categories[8]?.subcategories[1]?.items ?? []),
    ...(dbData?.categories[8]?.subcategories[2]?.items ?? []),
  ], [dbData]);
  const roleModelItems = useMemo(() => dbData?.categories[9]?.subcategories[0]?.items ?? [], [dbData]);
  const otherItems = useMemo(() => (dbData?.categories ?? []).flatMap(cat => cat.subcategories.flatMap(sub => sub.items)), [dbData]);

  // id -> subcategory name lookup
  const itemSubcategoryMap = useMemo(() => {
    const map = {};
    (dbData?.categories ?? []).forEach(cat => {
      cat.subcategories.forEach(sub => {
        sub.items.forEach(item => { map[item.id] = sub.name; });
      });
    });
    return map;
  }, [dbData]);
  const analyticsKeywordNameMap = useMemo(() => {
    const map = {};
    (dbData?.categories ?? []).forEach(cat => {
      cat.subcategories.forEach(sub => {
        sub.items.forEach(item => { map[item.id] = item.name; });
      });
    });
    return map;
  }, [dbData]);
  const keywordPrimarySelectorMap = useMemo(() => {
    const map = {};
    const selectorSources = {
      visualArt: visualArtItems,
      digitalArt: digitalArtItems,
      designSoft: designSoftItems,
      musicGenres: musicGenreItems,
      musicArtists: musicArtistItems,
      musicSoft: musicSoftItems,
      instruments: instrumentItems,
      movies: movieItems,
      tvShows: tvShowItems,
      anime: animeItems,
      games: gamingItems,
      progLang: progLangItems,
      subjects: subjectItems,
      personality: personalityItems,
      hobbies: hobbyItems,
      fitness: fitnessItems,
      sports: sportsItems,
      outdoor: outdoorItems,
      roleModels: roleModelItems,
    };

    Object.entries(selectorSources).forEach(([key, items]) => {
      items.forEach(item => {
        if (!map[item.id]) map[item.id] = key;
      });
    });

    return map;
  }, [
    visualArtItems, digitalArtItems, designSoftItems,
    musicGenreItems, musicArtistItems, musicSoftItems, instrumentItems,
    movieItems, tvShowItems, animeItems, gamingItems,
    progLangItems, subjectItems, personalityItems, hobbyItems,
    fitnessItems, sportsItems, outdoorItems, roleModelItems,
  ]);

  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showCancelSubModal, setShowCancelSubModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStage, setEditStage] = useState(1);
  const [validated, setValidated] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [location, setLocation] = useState("");
  const [locatingUser, setLocatingUser] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showPhone, setShowPhone] = useState(true);
  const [instagramUsername, setInstagramUsername] = useState("");
  const [showInstagram, setShowInstagram] = useState(true);
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [showTiktok, setShowTiktok] = useState(true);
  const [snapchatUsername, setSnapchatUsername] = useState("");
  const [showSnapchat, setShowSnapchat] = useState(true);
  const [discordUsername, setDiscordUsername] = useState("");
  const [showDiscord, setShowDiscord] = useState(true);
  const [_profileImage, setProfileImage] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(null);
  const [profileImageSizeError, setProfileImageSizeError] = useState(false);

  const resizeProfileImage = (file) => new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(imageUrl);

      const canvas = document.createElement("canvas");
      const size = 96;
      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext("2d");
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      const sourceY = (image.naturalHeight - sourceSize) / 2;

      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        size,
        size
      );

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to process profile image."));
            return;
          }

          const baseName = file.name.replace(/\.[^.]+$/, "") || "profile-picture";
          resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.85
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Invalid image file."));
    };

    image.src = imageUrl;
  });

  const handleProfileImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const resizedFile = await resizeProfileImage(file);
      if (resizedFile.size > 3 * 1024 * 1024) {
        setProfileImageSizeError(true);
        setProfileImage(null);
        setProfileImagePreview(null);
        return;
      }
      setProfileImageSizeError(false);
      setProfileImage(resizedFile);
      setProfileImagePreview(URL.createObjectURL(resizedFile));
    } catch {
      setProfileImageSizeError(true);
      setProfileImage(null);
      setProfileImagePreview(null);
    }
  };

  const removeProfileImage = () => {
    setProfileImage(null);
    setProfileImagePreview(null);
    setProfileImageSizeError(false);
  };

  const [savedProfile, setSavedProfile] = useState({
    firstName: "", lastName: "", birthDay: "", birthMonth: "", birthYear: "",
    location: "", countryCode: "", phoneNumber: "", showPhone: true,
    instagramUsername: "", showInstagram: true,
    tiktokUsername: "", showTiktok: true,
    snapchatUsername: "", showSnapchat: true,
    discordUsername: "", showDiscord: true,
    profileImagePreview: null, answers: {}, selected: {}, skipped: {},
    subscriptionStatus: "free",
    freeSearchesRemaining: 3,
    idType: 1,
  });
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [subscriptionDetails, setSubscriptionDetails] = useState({
    loading: false,
    error: "",
    currentPeriodEnd: null,
  });
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [unreadChatMessages, setUnreadChatMessages] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [drawInviteLink, setDrawInviteLink] = useState("");
  const [drawInviteLoading, setDrawInviteLoading] = useState(false);
  const [drawInviteError, setDrawInviteError] = useState("");
  const [drawInviteShareNotice, setDrawInviteShareNotice] = useState("");
  const [drawInviteCompleted, setDrawInviteCompleted] = useState(false);
  const [analytics, setAnalytics] = useState({
    totalSearchesDone: 0,
    totalTimesSearched: 0,
    totalProfileViews: 0,
    viewers: [],
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  // tracks whether we've already hydrated state from the DB for the current session
  const [profileLoaded, setProfileLoaded] = useState(false);
  const isModalOpen = showCancelSubModal || showAnalyticsModal || showEditModal || showChatModal || !!selectedNotification;

  // Reset profile state when the user logs out
  useEffect(() => {
    if (!session) {
      setSavedProfile({
        firstName: "", lastName: "", birthDay: "", birthMonth: "", birthYear: "",
        location: "", countryCode: "", phoneNumber: "", showPhone: true,
        instagramUsername: "", showInstagram: true,
        tiktokUsername: "", showTiktok: true,
        snapchatUsername: "", showSnapchat: true,
        discordUsername: "", showDiscord: true,
        profileImagePreview: null, answers: {}, selected: {}, skipped: {},
        subscriptionStatus: "free",
        freeSearchesRemaining: 3,
        idType: 1,
      });
      setProfileLoaded(false);
      setSubscriptionDetails({ loading: false, error: "", currentPeriodEnd: null });
      setShowChatModal(false);
      setChatMessages([]);
      setChatDraft("");
      setChatError("");
      setNotifications([]);
      setUnreadNotifications(0);
      setNotificationsError("");
      setSelectedNotification(null);
      setShowAnalyticsModal(false);
      setAnalyticsError("");
      setAnalytics({
        totalSearchesDone: 0,
        totalTimesSearched: 0,
        totalProfileViews: 0,
        viewers: [],
      });
    }
  }, [session]);

  useEffect(() => {
    if (!isModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen]);

  useEffect(() => {
    const dropdown = loginDropdownRef.current;
    const menu = loginDropdownMenuRef.current;
    if (!dropdown || !menu) return;
    const mobileLoginDropdownQuery = window.matchMedia("(max-width: 991.98px)");

    const updateLoginDropdownOffset = () => {
      if (!menu.classList.contains("show")) return;

      menu.style.setProperty("--navbar-login-offset-x", "0px");
      if (!mobileLoginDropdownQuery.matches) return;

      const viewportPadding = 8;
      const menuRect = menu.getBoundingClientRect();
      const maxRight = window.innerWidth - viewportPadding;
      let offsetX = maxRight - menuRect.right;

      if (menuRect.left + offsetX < viewportPadding) {
        offsetX = viewportPadding - menuRect.left;
      }

      menu.style.setProperty("--navbar-login-offset-x", `${Math.max(0, offsetX)}px`);
    };

    const resetLoginDropdownOffset = () => {
      menu.style.setProperty("--navbar-login-offset-x", "0px");
    };

    dropdown.addEventListener("shown.bs.dropdown", updateLoginDropdownOffset);
    dropdown.addEventListener("hidden.bs.dropdown", resetLoginDropdownOffset);
    window.addEventListener("resize", updateLoginDropdownOffset);

    return () => {
      dropdown.removeEventListener("shown.bs.dropdown", updateLoginDropdownOffset);
      dropdown.removeEventListener("hidden.bs.dropdown", resetLoginDropdownOffset);
      window.removeEventListener("resize", updateLoginDropdownOffset);
    };
  }, [session]);

  useEffect(() => {
    const dropdown = pricingDropdownRef.current;
    const menu = pricingDropdownMenuRef.current;
    if (!dropdown || !menu) return;
    const mobilePricingDropdownQuery = window.matchMedia("(max-width: 991.98px)");

    const updatePricingDropdownOffset = () => {
      if (!menu.classList.contains("show")) return;

      menu.style.setProperty("--navbar-pricing-offset-x", "0px");
      if (!mobilePricingDropdownQuery.matches) return;

      const viewportPadding = 8;
      const menuRect = menu.getBoundingClientRect();
      const maxRight = window.innerWidth - viewportPadding;
      let offsetX = maxRight - menuRect.right;

      if (menuRect.left + offsetX < viewportPadding) {
        offsetX = viewportPadding - menuRect.left;
      }

      menu.style.setProperty("--navbar-pricing-offset-x", `${Math.max(0, offsetX)}px`);
    };

    const resetPricingDropdownOffset = () => {
      menu.style.setProperty("--navbar-pricing-offset-x", "0px");
    };

    dropdown.addEventListener("shown.bs.dropdown", updatePricingDropdownOffset);
    dropdown.addEventListener("hidden.bs.dropdown", resetPricingDropdownOffset);
    window.addEventListener("resize", updatePricingDropdownOffset);

    return () => {
      dropdown.removeEventListener("shown.bs.dropdown", updatePricingDropdownOffset);
      dropdown.removeEventListener("hidden.bs.dropdown", resetPricingDropdownOffset);
      window.removeEventListener("resize", updatePricingDropdownOffset);
    };
  }, [session, savedProfile.subscriptionStatus]);

  useEffect(() => {
    let openTimeoutId = null;

    const openPricingDropdown = () => {
      if (openTimeoutId) window.clearTimeout(openTimeoutId);

      openTimeoutId = window.setTimeout(() => {
        if (!pricingDropdownMenuRef.current?.classList.contains("show")) {
          pricingDropdownToggleRef.current?.click();
        }
        pricingDropdownToggleRef.current?.blur();
        openTimeoutId = null;
      }, 0);
    };

    window.addEventListener("lfp:open-pricing", openPricingDropdown);
    return () => {
      if (openTimeoutId) window.clearTimeout(openTimeoutId);
      window.removeEventListener("lfp:open-pricing", openPricingDropdown);
    };
  }, []);

  useEffect(() => {
    const dropdown = notificationsDropdownRef.current;
    const menu = notificationsDropdownMenuRef.current;
    if (!dropdown || !menu) return;
    const mobileNotificationsDropdownQuery = window.matchMedia("(max-width: 991.98px)");

    const updateNotificationsDropdownOffset = () => {
      if (!menu.classList.contains("show")) return;

      menu.style.setProperty("--navbar-notifications-offset-x", "0px");
      if (!mobileNotificationsDropdownQuery.matches) return;

      const viewportPadding = 8;
      const menuRect = menu.getBoundingClientRect();
      const maxRight = window.innerWidth - viewportPadding;
      let offsetX = maxRight - menuRect.right;

      if (menuRect.left + offsetX < viewportPadding) {
        offsetX = viewportPadding - menuRect.left;
      }

      menu.style.setProperty("--navbar-notifications-offset-x", `${Math.max(0, offsetX)}px`);
    };

    const resetNotificationsDropdownOffset = () => {
      menu.style.setProperty("--navbar-notifications-offset-x", "0px");
    };

    dropdown.addEventListener("shown.bs.dropdown", updateNotificationsDropdownOffset);
    dropdown.addEventListener("hidden.bs.dropdown", resetNotificationsDropdownOffset);
    window.addEventListener("resize", updateNotificationsDropdownOffset);

    return () => {
      dropdown.removeEventListener("shown.bs.dropdown", updateNotificationsDropdownOffset);
      dropdown.removeEventListener("hidden.bs.dropdown", resetNotificationsDropdownOffset);
      window.removeEventListener("resize", updateNotificationsDropdownOffset);
    };
  }, [session, isAdmin]);

  // Hydrate all profile state from DB once session + catalog are both ready
  useEffect(() => {
    if (authLoading || !session?.user || !dbData || profileLoaded) return;

    const selectorItems = {
      visualArt: visualArtItems, digitalArt: digitalArtItems,
      musicGenres: musicGenreItems, musicArtists: musicArtistItems,
      musicSoft: musicSoftItems, instruments: instrumentItems,
      performing: performItems, writing: writingItems,
      movies: movieItems, tvShows: tvShowItems, anime: animeItems,
      games: gamingItems, memes: memeItems, apps: appItems,
      devices: deviceItems, designSoft: designSoftItems,
      progLang: progLangItems, ai: aiItems, subjects: subjectItems,
      careers: careerItems, personality: personalityItems, hobbies: hobbyItems,
      sexuality: sexualityItems, fitness: fitnessItems, sports: sportsItems,
      outdoor: outdoorItems, food: foodItems, places: placeItems,
      animals: animalItems, vehicles: vehicleItems, roleModels: roleModelItems,
      other: otherItems,
    };

    getUserProfile(session.user.id)
      .then((data) => {
        const { profile, keywordIds } = data;

        // Parse "YYYY-MM-DD" into individual day/month/year strings
        let loadedDay = "", loadedMonth = "", loadedYear = "";
        if (profile.dateOfBirth) {
          const parts = profile.dateOfBirth.split("-");
          loadedYear = parts[0] || "";
          loadedMonth = formatBirthDatePart(parts[1]);
          loadedDay = formatBirthDatePart(parts[2]);
        }

        // Build id→name and id→[selectorKey] maps from the catalog
        const idToName = {};
        (dbData?.categories ?? []).forEach(cat =>
          cat.subcategories.forEach(sub =>
            sub.items.forEach(item => { idToName[item.id] = item.name; })
          )
        );

        const idToSelectors = {};
        for (const [key, items] of Object.entries(selectorItems)) {
          for (const item of items) {
            if (!idToSelectors[item.id]) idToSelectors[item.id] = [];
            idToSelectors[item.id].push(key);
          }
        }

        // Distribute each stored keyword ID into all matching selector buckets
        const newSelected = {};
        for (const kwId of keywordIds) {
          const keys = idToSelectors[kwId] || [];
          const name = idToName[kwId];
          if (!name) continue;
          for (const key of keys) {
            if (!newSelected[key]) newSelected[key] = [];
            if (!newSelected[key].includes(name)) newSelected[key].push(name);
          }
        }

        // Use the stored answers and skipped states directly from DB
        // answers: { key: "yes"|"no"|null }, skipped: { key: boolean }
        const newAnswers = {};
        for (const [key, val] of Object.entries(data.answers || {})) {
          if (val !== null) newAnswers[key] = val;
        }
        newAnswers.visualArt = combineAnswers(newAnswers.visualArt, newAnswers.digitalArt);
        newAnswers.produceMusic = combineAnswers(newAnswers.produceMusic, newAnswers.playInstruments);
        newAnswers.goGym = combineAnswers(newAnswers.goGym, newAnswers.practiceSports, newAnswers.likeOutdoor);
        const newSkipped = data.skipped || {};
        const showPhoneDefault = profile.phoneNumber ? profile.showPhone : true;
        const showInstagramDefault = profile.instagram ? profile.showInstagram : true;
        const showTiktokDefault = profile.tiktok ? profile.showTiktok : true;
        const showSnapchatDefault = profile.snapchat ? profile.showSnapchat : true;
        const showDiscordDefault = profile.discord ? profile.showDiscord : true;

        // Apply all state at once
        setFirstName(profile.firstName);
        setLastName(profile.lastName);
        setBirthDay(loadedDay);
        setBirthMonth(loadedMonth);
        setBirthYear(loadedYear);
        setLocation(profile.location);
        {
          const spaceIdx = (profile.phoneNumber || "").indexOf(" ");
          if (spaceIdx > 0) {
            setCountryCode(profile.phoneNumber.slice(0, spaceIdx));
            setPhoneNumber(profile.phoneNumber.slice(spaceIdx + 1));
          } else {
            setCountryCode("");
            setPhoneNumber(profile.phoneNumber || "");
          }
        }
        setShowPhone(showPhoneDefault);
        setInstagramUsername(profile.instagram);
        setShowInstagram(showInstagramDefault);
        setTiktokUsername(profile.tiktok);
        setShowTiktok(showTiktokDefault);
        setSnapchatUsername(profile.snapchat);
        setShowSnapchat(showSnapchatDefault);
        setDiscordUsername(profile.discord);
        setShowDiscord(showDiscordDefault);
        setProfileImagePreview(profile.profileUrl);
        setAnswers(newAnswers);
        setSelected(newSelected);
        setSkipped(newSkipped);

        const hydratedProfile = {
          firstName: profile.firstName, lastName: profile.lastName,
          birthDay: loadedDay, birthMonth: loadedMonth, birthYear: loadedYear,
          location: profile.location,
          countryCode: (profile.phoneNumber || "").indexOf(" ") > 0 ? profile.phoneNumber.slice(0, profile.phoneNumber.indexOf(" ")) : "",
          phoneNumber: (profile.phoneNumber || "").indexOf(" ") > 0 ? profile.phoneNumber.slice(profile.phoneNumber.indexOf(" ") + 1) : (profile.phoneNumber || ""),
          showPhone: showPhoneDefault,
          instagramUsername: profile.instagram, showInstagram: showInstagramDefault,
          tiktokUsername: profile.tiktok, showTiktok: showTiktokDefault,
          snapchatUsername: profile.snapchat, showSnapchat: showSnapchatDefault,
          discordUsername: profile.discord, showDiscord: showDiscordDefault,
          profileImagePreview: profile.profileUrl,
          answers: newAnswers, selected: newSelected, skipped: newSkipped,
          subscriptionStatus: profile.subscriptionStatus || "free",
          freeSearchesRemaining: profile.freeSearchesRemaining ?? 3,
          freeSearchesResetAt: profile.freeSearchesResetAt || null,
          idType: profile.idType || 1,
        };
        setSavedProfile(hydratedProfile);
        if (onProfileSave) onProfileSave(hydratedProfile);
      })
      .catch((err) => {
        // 404 just means a brand-new account with no profile yet — that's fine
        if (!err.message?.includes("User not found")) {
          console.error("Failed to load profile from DB:", err.message);
        }
      })
      .finally(() => {
        setProfileLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session, dbData, profileLoaded]);

  // Stage 2: compact state — 4 objects instead of ~100 individual hooks
  const [answers, setAnswers] = useState({});  // yes/no answers  keyed by question id
  const [selected, setSelected] = useState({});  // selected keywords keyed by selector id
  const [skipped, setSkipped] = useState({});  // skip flags        keyed by selector id
  const [searches, setSearches] = useState({});  // search terms      keyed by selector id
  const [debouncedSearches, setDebouncedSearches] = useState({});
  const [loadingSearchKeys, setLoadingSearchKeys] = useState({});
  const yesNoKeys = useMemo(() => PROFILE_YES_NO_KEYS, []);
  const directKeys = useMemo(() => PROFILE_DIRECT_KEYS, []);
  const selectedGender = getSelectedGender(selected);
  const firstStageCountryNames = useMemo(
    () => getMatchingCountryNames(location, countryItems),
    [location, countryItems]
  );
  const hiddenOtherInterestNames = useMemo(() => {
    const hidden = new Set(firstStageCountryNames);
    if (selectedGender) hidden.add(selectedGender);
    return hidden;
  }, [firstStageCountryNames, selectedGender]);
  const savedProfileGender = getSelectedGender(savedProfile.selected);
  const savedProfileCountryNames = useMemo(
    () => getMatchingCountryNames(savedProfile.location, countryItems),
    [savedProfile.location, countryItems]
  );

  const isProfileComplete = useMemo(() => {
    const hasRequiredProfileInfo =
      !!savedProfile.firstName?.trim() &&
      !!savedProfile.lastName?.trim() &&
      !!savedProfile.birthDay &&
      !!savedProfile.birthMonth &&
      !!savedProfile.birthYear &&
      !!savedProfile.location?.trim();
    const hasRequiredGender = !!savedProfileGender;

    const hasVisibleContact =
      (!!savedProfile.phoneNumber?.trim() && savedProfile.showPhone) ||
      (!!savedProfile.instagramUsername?.trim() && savedProfile.showInstagram) ||
      (!!savedProfile.tiktokUsername?.trim() && savedProfile.showTiktok) ||
      (!!savedProfile.snapchatUsername?.trim() && savedProfile.showSnapchat) ||
      (!!savedProfile.discordUsername?.trim() && savedProfile.showDiscord);

    const answeredYesNo = yesNoKeys.filter((key) => savedProfile.answers?.[key] != null).length;
    const completedDirect = directKeys.filter(
      (key) => isDirectQuestionComplete(
        savedProfile.selected,
        savedProfile.skipped,
        key,
        savedProfileGender,
        savedProfileCountryNames
      )
    ).length;
    const completedAllQuestions = answeredYesNo + completedDirect === yesNoKeys.length + directKeys.length;

    return hasRequiredProfileInfo && hasRequiredGender && hasVisibleContact && completedAllQuestions;
  }, [savedProfile, savedProfileGender, savedProfileCountryNames, yesNoKeys, directKeys]);

  const mustCompleteProfile =
    !!session &&
    profileLoaded &&
    routerLocation.pathname === "/" &&
    !isProfileComplete;

  const setAnswer = (key, val) => setAnswers(prev => ({ ...prev, [key]: prev[key] === val ? null : val }));
  const toggleKw = (key, name, item = null) => setSelected(prev => {
    const removeFromKey = (state, targetKey) => {
      const nextValues = (state[targetKey] || []).filter(value => value !== name);
      if (nextValues.length > 0) {
        state[targetKey] = nextValues;
      } else {
        delete state[targetKey];
      }
    };

    const addToKey = (state, targetKey) => {
      const currentValues = state[targetKey] || [];
      if (!currentValues.includes(name)) {
        state[targetKey] = [...currentValues, name];
      }
    };

    if (key === "other" && hiddenOtherInterestNames.has(name)) return prev;

    if (key === "other") {
      const targetKey = item ? keywordPrimarySelectorMap[item.id] || "other" : "other";
      const isSelected =
        (prev[targetKey] || []).includes(name) ||
        (prev.other || []).includes(name);
      const next = { ...prev };

      if (isSelected) {
        removeFromKey(next, targetKey);
        removeFromKey(next, "other");
        return next;
      }

      addToKey(next, targetKey);
      return next;
    }

    const current = prev[key] || [];
    const next = { ...prev };

    if (current.includes(name)) {
      removeFromKey(next, key);
      removeFromKey(next, "other");
      return next;
    }

    addToKey(next, key);
    return next;
  });
  const toggleSkip = (key) => setSkipped(prev => ({ ...prev, [key]: !prev[key] }));
  const setSearch = (key, val) => setSearches(prev => ({ ...prev, [key]: val }));
  const setGenderSelection = (gender) => {
    setSelected(prev => {
      const otherSelected = (prev.other || []).filter(name => !GENDER_KEYWORDS.includes(name));
      return {
        ...prev,
        other: gender ? [...otherSelected, gender] : otherSelected,
      };
    });
  };
  const requestMissingKeyword = async (key, term) => {
    if (!term) return;
    const current = keywordRequestStatuses[key];
    if (current?.term === term && current.status === "loading") return;

    setKeywordRequestStatuses(prev => ({ ...prev, [key]: { term, status: "loading" } }));
    try {
      await requestKeyword(term);
      setKeywordRequestStatuses(prev => ({ ...prev, [key]: { term, status: "done" } }));
    } catch {
      setKeywordRequestStatuses(prev => ({ ...prev, [key]: { term, status: "error" } }));
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const city = data.address.city || data.address.town || data.address.village || "";
          const country = data.address.country || "";
          setLocation(city && country ? `${city}, ${country}` : city || country);
        } catch {
          alert("Could not determine your location. Please enter it manually.");
        } finally {
          setLocatingUser(false);
        }
      },
      () => {
        alert("Location permission denied. Please enter your location manually.");
        setLocatingUser(false);
      }
    );
  };

  const prevSearchesRef = useRef({});

  // Debounce keyword searches per section
  useEffect(() => {
    const prev = prevSearchesRef.current;
    prevSearchesRef.current = searches;
    const changedKeys = Object.keys({ ...prev, ...searches }).filter(k => searches[k] !== prev[k]);
    if (changedKeys.length === 0) return;
    setLoadingSearchKeys(prevLoading => {
      const next = { ...prevLoading };
      changedKeys.forEach(k => { next[k] = true; });
      return next;
    });
    const timer = setTimeout(() => {
      setDebouncedSearches({ ...searches });
      setLoadingSearchKeys({});
    }, 400);
    return () => clearTimeout(timer);
  }, [searches]);

  // ── Auto-select related keywords ────────────────────────────────────────────
  const autoSelect = (key, name) => {
    setSelected(prev => (prev[key] || []).includes(name) ? prev : { ...prev, [key]: [...(prev[key] || []), name] });
  };

  useEffect(() => {
    if (answers.listenMusic === "yes") autoSelect("hobbies", "Music");
  }, [answers.listenMusic]);

  useEffect(() => {
    if ((selected.movies || []).length > 0) autoSelect("hobbies", "Watching Movies");
  }, [selected.movies]);

  useEffect(() => {
    if ((selected.tvShows || []).length > 0) autoSelect("hobbies", "Watching TV Shows");
  }, [selected.tvShows]);

  useEffect(() => {
    if (answers.likeAnime === "yes") autoSelect("hobbies", "Watching Anime");
  }, [answers.likeAnime]);

  useEffect(() => {
    if (answers.likeGames === "yes") autoSelect("games", "Video Games");
  }, [answers.likeGames]);

  useEffect(() => {
    if (answers.likeProgramming === "yes") autoSelect("hobbies", "Coding");
  }, [answers.likeProgramming]);

  useEffect(() => {
    if (answers.goGym === "yes") autoSelect("fitness", "Gym");
  }, [answers.goGym]);

  const handleGoogleLogin = async (e) => {
    e.preventDefault();
    setGoogleLoading(true);
    setAuthError("");
    const inviteCode = getInviteCodeFromSearch(routerLocation.search);
    if (inviteCode) storePendingInviteCode(inviteCode);

    const siteUrl = import.meta.env.VITE_SITE_URL?.replace(/\/$/, "");
    const redirectOrigin = siteUrl || window.location.origin;
    const redirectTo = `${redirectOrigin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setGoogleLoading(false);
      setAuthError(error.message);
    }
  };

  const handleLogout = async (e) => {
    e.preventDefault();
    // Fire-and-forget: write the logout log before signing out.
    Promise.resolve(supabase
      .rpc("write_log", { p_action: "LOG_OUT", p_status: "Success" })
    ).catch(() => { });
    await supabase.auth.signOut();
  };

  const loadGlobalChatMessages = useCallback(async ({ silent = false } = {}) => {
    if (!session?.user?.id) return;

    if (!silent) setChatLoading(true);
    setChatError("");

    try {
      const messages = await listGlobalChatMessages();
      setChatMessages(messages);
    } catch (err) {
      setChatError(err.message || "Failed to load chat.");
    } finally {
      if (!silent) setChatLoading(false);
    }
  }, [session?.user?.id]);

  const loadUnreadChatMessageCount = useCallback(async () => {
    if (!session?.user?.id) {
      setUnreadChatMessages(0);
      return;
    }

    try {
      const count = await getUnreadGlobalChatMessageCount();
      setUnreadChatMessages(count);
    } catch {
      // The badge is best-effort; chat itself remains usable if this fails.
    }
  }, [session?.user?.id]);

  const openGlobalChat = () => {
    setShowChatModal(true);
    setChatError("");
    setUnreadChatMessages(0);
  };

  const closeGlobalChat = () => {
    setShowChatModal(false);
    setChatDraft("");
  };

  const openChatAuthorInConsole = (message) => {
    if (!message?.userId) return;
    setShowChatModal(false);
    setChatDraft("");
    navigate(`/?user=${encodeURIComponent(message.userId)}`);
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!session?.user) {
      setChatError("Sign in to send messages.");
      return;
    }

    const body = chatDraft.trim();
    if (!body || chatSending) return;

    setChatSending(true);
    setChatError("");

    try {
      const message = await sendGlobalChatMessage(body);
      setChatDraft("");
      if (message) {
        setChatMessages(prev => (
          prev.some(existing => existing.id === message.id) ? prev : [...prev, message]
        ));
      }
      loadGlobalChatMessages({ silent: true });
    } catch (err) {
      setChatError(err.message || "Failed to send message.");
    } finally {
      setChatSending(false);
    }
  };

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (authLoading) return;

    if (!session?.user?.id) {
      setNotifications([]);
      setUnreadNotifications(0);
      return;
    }

    if (!silent) setNotificationsLoading(true);
    setNotificationsError("");

    try {
      const [items, unreadCount] = await Promise.all([
        listSiteNotifications(),
        getUnreadSiteNotificationCount(),
      ]);
      setNotifications(items);
      setUnreadNotifications(unreadCount);
    } catch (err) {
      setNotificationsError(err.message || "Failed to load notifications.");
    } finally {
      if (!silent) setNotificationsLoading(false);
    }
  }, [authLoading, session?.user?.id]);

  const openNotification = useCallback(async (notification) => {
    if (!notification) return;

    setSelectedNotification(notification);

    if (!session?.user || notification.isRead) return;

    setNotifications(prev => prev.map(item =>
      item.id === notification.id ? { ...item, isRead: true } : item
    ));
    setUnreadNotifications(prev => Math.max(0, prev - 1));

    try {
      await markSiteNotificationRead(notification.id);
      loadNotifications({ silent: true });
    } catch (err) {
      setNotificationsError(err.message || "Failed to update notification.");
    }
  }, [loadNotifications, session?.user]);

  useEffect(() => {
    setDrawInviteLink("");
    setDrawInviteError("");
    setDrawInviteShareNotice("");
    setDrawInviteCompleted(false);

    if (
      !selectedNotification?.isDrawEvent ||
      !selectedNotification.drawEventId ||
      selectedNotification.isDisabled ||
      !session?.user
    ) {
      setDrawInviteLoading(false);
      return undefined;
    }

    let cancelled = false;
    setDrawInviteLoading(true);

    getOrCreateDrawEventInvite(selectedNotification.drawEventId)
      .then(({ inviteCode, hasCompletedSignup }) => {
        if (cancelled) return;
        setDrawInviteCompleted(hasCompletedSignup);
        if (!hasCompletedSignup) setDrawInviteLink(buildInviteUrl(inviteCode));
      })
      .catch((err) => {
        if (!cancelled) setDrawInviteError(err.message || "Failed to create invite link.");
      })
      .finally(() => {
        if (!cancelled) setDrawInviteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedNotification?.drawEventId,
    selectedNotification?.isDisabled,
    selectedNotification?.isDrawEvent,
    session?.user,
    unreadNotifications,
  ]);

  const shareDrawInviteLink = async () => {
    if (!drawInviteLink) return;

    const shareMessage = buildDrawInviteShareMessage();
    setDrawInviteShareNotice("");

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: DRAW_INVITE_SHARE_TITLE,
          text: shareMessage,
        });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    const copied = await copyTextToClipboard(shareMessage);
    setDrawInviteShareNotice(copied ? "Share message copied." : "Sharing is not available in this browser.");
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOpenSiteNotification = (event) => {
      openNotification(event.detail);
    };

    window.addEventListener(OPEN_SITE_NOTIFICATION_EVENT, handleOpenSiteNotification);

    return () => {
      window.removeEventListener(OPEN_SITE_NOTIFICATION_EVENT, handleOpenSiteNotification);
    };
  }, [openNotification]);

  const handleSubscribe = async (e) => {
    e.preventDefault();

    if (!session?.user) {
      window.location.href = "/login";
      return;
    }

    setCheckoutLoading(true);

    const successUrl = `${window.location.origin}${window.location.pathname}?subscribed=1`;
    const cancelUrl = `${window.location.origin}${window.location.pathname}`;

    const { data, error } = await supabase.functions.invoke("stripe-create-checkout", {
      body: { successUrl, cancelUrl },
    });

    if (error || data?.error) {
      setCheckoutLoading(false);
      alert(await getFunctionErrorMessage(error, data, "Failed to create checkout session."));
      return;
    }

    if (!data?.url) {
      setCheckoutLoading(false);
      alert("No checkout URL returned.");
      return;
    }

    window.location.href = data.url;
  };

  const handleCancelSubscription = async (e) => {
    e?.preventDefault();
    if (!session?.user) return;
    if (!window.confirm("Are you sure you want to cancel your subscription now? Your subscription will end immediately, and you can subscribe again with a new renewal date.")) return;

    setCancelLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-cancel-subscription", {
        body: {},
      });
      if (error || data?.error) {
        alert(await getFunctionErrorMessage(error, data, "Failed to cancel subscription."));
        setCancelLoading(false);
        return;
      }
      setSavedProfile(prev => ({ ...prev, subscriptionStatus: "canceled" }));
      setSubscriptionDetails({ loading: false, error: "", currentPeriodEnd: null });
      window.location.reload();
    } catch (err) {
      alert("Failed to cancel subscription: " + err.message);
    } finally {
      setCancelLoading(false);
    }
  };

  const openEditProfile = () => {
    setFirstName(savedProfile.firstName);
    setLastName(savedProfile.lastName);
    setBirthDay(formatBirthDatePart(savedProfile.birthDay));
    setBirthMonth(formatBirthDatePart(savedProfile.birthMonth));
    setBirthYear(savedProfile.birthYear);
    setLocation(savedProfile.location);
    setCountryCode(savedProfile.countryCode);
    setPhoneNumber(savedProfile.phoneNumber);
    setShowPhone(savedProfile.showPhone);
    setInstagramUsername(savedProfile.instagramUsername);
    setShowInstagram(savedProfile.showInstagram);
    setTiktokUsername(savedProfile.tiktokUsername);
    setShowTiktok(savedProfile.showTiktok);
    setSnapchatUsername(savedProfile.snapchatUsername);
    setShowSnapchat(savedProfile.showSnapchat);
    setDiscordUsername(savedProfile.discordUsername);
    setShowDiscord(savedProfile.showDiscord);
    setProfileImage(null);
    setProfileImagePreview(savedProfile.profileImagePreview);
    setProfileImageSizeError(false);
    setAnswers(savedProfile.answers);
    setSelected(savedProfile.selected);
    setSkipped(savedProfile.skipped);
    setShowEditModal(true);
    setEditStage(1);
  };

  const loadAnalytics = useCallback(async () => {
    if (!session?.user?.id) return;

    setAnalyticsLoading(true);
    setAnalyticsError("");

    try {
      setAnalytics(await getMyProfileAnalytics(25));
    } catch (err) {
      setAnalyticsError(err.message || "Failed to load analytics.");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [session?.user?.id]);

  const openAnalytics = () => {
    setShowAnalyticsModal(true);
    loadAnalytics();
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(routerLocation.search);
    if (searchParams.get("subscribed") !== "1") return;

    searchParams.delete("subscribed");
    const cleanSearch = searchParams.toString();
    navigate(
      {
        pathname: routerLocation.pathname,
        search: cleanSearch ? `?${cleanSearch}` : "",
        hash: routerLocation.hash,
      },
      { replace: true },
    );
  }, [navigate, routerLocation.hash, routerLocation.pathname, routerLocation.search]);

  useEffect(() => {
    if (routerLocation.pathname !== "/") return;
    setShowCancelSubModal(false);
    setShowAnalyticsModal(false);
    setShowEditModal(false);
    setShowChatModal(false);
    setSelectedNotification(null);
    setEditStage(1);
    setValidated(false);
    setSearches({});
  }, [routerLocation.pathname]);

  useEffect(() => {
    if (!session?.user?.id) {
      setUnreadChatMessages(0);
      return undefined;
    }

    let isMounted = true;
    loadUnreadChatMessageCount();

    const channel = subscribeToGlobalChatMessages(() => {
      if (!isMounted) return;
      if (showChatModal) {
        loadGlobalChatMessages({ silent: true });
        Promise.resolve(markGlobalChatMessagesRead())
          .then(() => setUnreadChatMessages(0))
          .catch(() => { });
      } else {
        loadUnreadChatMessageCount();
      }
    });

    return () => {
      isMounted = false;
      removeGlobalChatSubscription(channel);
    };
  }, [loadGlobalChatMessages, loadUnreadChatMessageCount, session?.user?.id, showChatModal]);

  useEffect(() => {
    if (!showChatModal || !session?.user?.id) return undefined;

    let isMounted = true;
    loadGlobalChatMessages()
      .then(() => markGlobalChatMessagesRead())
      .then(() => {
        if (isMounted) setUnreadChatMessages(0);
      })
      .catch(() => { });

    return () => {
      isMounted = false;
    };
  }, [loadGlobalChatMessages, session?.user?.id, showChatModal]);

  useEffect(() => {
    if (!showChatModal || chatLoading) return undefined;

    const scrollToLatestMessage = () => {
      const body = chatMessagesBodyRef.current;
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    };

    scrollToLatestMessage();
    const frameId = window.requestAnimationFrame(scrollToLatestMessage);
    const timeoutId = window.setTimeout(scrollToLatestMessage, 80);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [chatLoading, chatMessages.length, showChatModal]);

  useEffect(() => {
    if (authLoading || !session?.user?.id) return;

    let isMounted = true;
    loadNotifications();

    const channel = subscribeToSiteNotifications(() => {
      if (isMounted) loadNotifications({ silent: true });
    });

    return () => {
      isMounted = false;
      removeSiteNotificationSubscription(channel);
    };
  }, [authLoading, loadNotifications, session?.user?.id]);

  useEffect(() => {
    const hasSubscription =
      savedProfile.subscriptionStatus === "active" ||
      savedProfile.subscriptionStatus === "canceling";

    if (!showCancelSubModal || !session?.user?.id || !hasSubscription) return;

    let isMounted = true;
    setSubscriptionDetails(prev => ({ ...prev, loading: true, error: "" }));

    supabase.functions
      .invoke("stripe-get-subscription", { body: {} })
      .then(async ({ data, error }) => {
        if (!isMounted) return;
        if (error || data?.error) {
          setSubscriptionDetails({
            loading: false,
            error: await getFunctionErrorMessage(error, data, "Failed to load subscription date."),
            currentPeriodEnd: null,
          });
          return;
        }
        setSubscriptionDetails({
          loading: false,
          error: "",
          currentPeriodEnd: data?.currentPeriodEnd ?? null,
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        setSubscriptionDetails({
          loading: false,
          error: err.message || "Failed to load subscription date.",
          currentPeriodEnd: null,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [showCancelSubModal, session?.user?.id, savedProfile.subscriptionStatus]);

  useEffect(() => {
    if (!mustCompleteProfile) return;
    if (showEditModal) return;
    openEditProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mustCompleteProfile, showEditModal]);

  const closeEditModal = ({ force = false } = {}) => {
    if (mustCompleteProfile && !force) return;
    setShowEditModal(false);
    setEditStage(1);
    setValidated(false);
    setSearches({});
  };

  useEffect(() => {
    if (session) return;
    if (routerLocation.pathname !== "/") return;
    const shouldOpenAuth = new URLSearchParams(routerLocation.search).get("auth") === "open";
    if (!shouldOpenAuth) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      loginDropdownToggleRef.current?.click();
      loginDropdownToggleRef.current?.blur();
      navigate("/", { replace: true });
    }, 0);
  }, [routerLocation.pathname, routerLocation.search, navigate, session]);

  useEffect(() => {
    const inviteCode = getInviteCodeFromSearch(routerLocation.search);
    if (!inviteCode) return;

    if (session) {
      inviteAuthOpenedRef.current = "";
      navigate("/", { replace: true });
      return;
    }

    storePendingInviteCode(inviteCode);
    if (routerLocation.pathname !== "/") {
      navigate(`/?invite=${encodeURIComponent(inviteCode)}`, { replace: true });
      return;
    }

    if (inviteAuthOpenedRef.current === inviteCode) return;
    inviteAuthOpenedRef.current = inviteCode;
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      loginDropdownToggleRef.current?.click();
      loginDropdownToggleRef.current?.blur();
    }, 0);
  }, [routerLocation.pathname, routerLocation.search, navigate, session]);

  // Renders a keyword selector. Caps unselected items at 100 when no search is
  // active to keep performance reasonable; selected items always show.
  const renderKeywords = (key, items, canSkip) => {
    const term = (debouncedSearches[key] || "").toLowerCase();
    const isLoadingKw = !!loadingSearchKeys[key];
    const sel = key === "other"
      ? (selected[key] || []).filter(name => !hiddenOtherInterestNames.has(name))
      : selected[key] || [];
    const isSkipped = canSkip && !!skipped[key];
    const allFiltered = items.filter(i =>
      i.name.toLowerCase().includes(term) &&
      (key !== "other" || !hiddenOtherInterestNames.has(i.name))
    );
    const isSelectedItem = (item) => {
      if (key !== "other") return sel.includes(item.name);
      const targetKey = keywordPrimarySelectorMap[item.id] || "other";
      return (selected[targetKey] || []).includes(item.name) || (selected.other || []).includes(item.name);
    };
    const filteredSel = allFiltered.filter(isSelectedItem);
    const filteredUnsel = allFiltered.filter(i => !isSelectedItem(i));
    const unselToShow = term ? filteredUnsel : filteredUnsel.slice(0, 100);
    const hasMore = !term && filteredUnsel.length > 100;
    const requestTerm = (debouncedSearches[key] || "").trim();
    const requestState = keywordRequestStatuses[key]?.term === requestTerm
      ? keywordRequestStatuses[key].status
      : null;
    return (
      <div>
        <div className="input-group mb-2">
          <span className="input-group-text bg-white border-end-0" style={{ borderRadius: "8px 0 0 8px" }}>
            <i className="bi bi-search"></i>
          </span>
          <input
            type="text"
            className="form-control border-start-0"
            placeholder="Search..."
            value={searches[key] || ""}
            onChange={e => setSearch(key, e.target.value)}
            style={{ borderRadius: canSkip ? "0" : "0 8px 8px 0" }}
          />
          {canSkip && !isSkipped && (
            <button type="button" className="btn btn-outline-primary" style={{ borderRadius: "0 8px 8px 0" }} onClick={() => toggleSkip(key)}>
              Skip
            </button>
          )}
          {canSkip && isSkipped && (
            <button type="button" className="btn btn-outline-primary" style={{ borderRadius: "0 8px 8px 0" }} onClick={() => toggleSkip(key)}>
              Undo Skip
            </button>
          )}
        </div>
        {!isSkipped && (
          <>
            <div className="border rounded-4 p-2 unselected-keywords-container">
              <div className="modal-scroll-area d-flex flex-wrap gap-2">
                {isLoadingKw ? (
                  <div className="d-flex justify-content-center align-items-center w-100" style={{ minHeight: "80px" }}>
                    <div className="spinner-border spinner-primary" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {filteredSel.map(i => (
                      <button key={i.id} type="button" className="btn btn-category modal-keyword-card" onClick={() => toggleKw(key, i.name, i)}>
                        <small className="d-block text-start opacity-75">{itemSubcategoryMap[i.id] || "Interest"}</small>
                        <div className="d-flex align-items-center gap-2"><span>{i.name}</span><i className="bi bi-dash-square"></i></div>
                      </button>
                    ))}
                    {unselToShow.map(i => (
                      <button key={i.id} type="button" className="btn btn-category-outline modal-keyword-card" onClick={() => toggleKw(key, i.name, i)}>
                        <small className="d-block text-start opacity-75">{itemSubcategoryMap[i.id] || "Interest"}</small>
                        <div className="d-flex align-items-center gap-2"><span>{i.name}</span><i className="bi bi-plus-square"></i></div>
                      </button>
                    ))}
                    {allFiltered.length === 0 && (
                      <span className="text-muted w-100 text-center">
                        No results found.{' '}
                        {requestTerm && (
                          requestState === 'done' ? (
                            <span className="text-success">Keyword requested!</span>
                          ) : requestState === 'error' ? (
                            <span className="text-danger">Failed to request keyword.</span>
                          ) : (
                            <a
                              href="#"
                              style={{ textDecoration: 'underline', color: '#6D28D9' }}
                              onClick={async (e) => {
                                e.preventDefault();
                                await requestMissingKeyword(key, requestTerm);
                              }}
                            >
                              {requestState === 'loading' ? 'Requesting...' : 'Click me to request keyword'}
                            </a>
                          )
                        )}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            {!isLoadingKw && hasMore && (
              <small className="text-muted d-block mt-1">Showing 100 of {filteredUnsel.length} results. Use the search bar to find more.</small>
            )}
          </>
        )}
      </div>
    );
  };

  const renderCombinedKeywords = (searchKey, sources) => {
    const term = (debouncedSearches[searchKey] || "").toLowerCase();
    const isLoadingKw = !!loadingSearchKeys[searchKey];
    const allItems = sources.flatMap(({ key, items }) =>
      items.map(item => ({
        ...item,
        selectorKey: key,
        uniqueKey: `${key}-${item.id}`,
        isSelected: (selected[key] || []).includes(item.name),
      }))
    );
    const allFiltered = allItems.filter(item => item.name.toLowerCase().includes(term));
    const filteredSel = allFiltered.filter(item => item.isSelected);
    const filteredUnsel = allFiltered.filter(item => !item.isSelected);
    const unselToShow = term ? filteredUnsel : filteredUnsel.slice(0, 100);
    const hasMore = !term && filteredUnsel.length > 100;
    const requestTerm = (debouncedSearches[searchKey] || "").trim();
    const requestState = keywordRequestStatuses[searchKey]?.term === requestTerm
      ? keywordRequestStatuses[searchKey].status
      : null;

    return (
      <div>
        <div className="input-group mb-2">
          <span className="input-group-text bg-white border-end-0" style={{ borderRadius: "8px 0 0 8px" }}>
            <i className="bi bi-search"></i>
          </span>
          <input
            type="text"
            className="form-control border-start-0"
            placeholder="Search..."
            value={searches[searchKey] || ""}
            onChange={e => setSearch(searchKey, e.target.value)}
            style={{ borderRadius: "0 8px 8px 0" }}
          />
        </div>
        <div className="border rounded-4 p-2 unselected-keywords-container">
          <div className="modal-scroll-area d-flex flex-wrap gap-2">
            {isLoadingKw ? (
              <div className="d-flex justify-content-center align-items-center w-100" style={{ minHeight: "80px" }}>
                <div className="spinner-border spinner-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : (
              <>
                {filteredSel.map(item => (
                  <button key={item.uniqueKey} type="button" className="btn btn-category modal-keyword-card" onClick={() => toggleKw(item.selectorKey, item.name)}>
                    <small className="d-block text-start opacity-75">{itemSubcategoryMap[item.id] || "Interest"}</small>
                    <div className="d-flex align-items-center gap-2"><span>{item.name}</span><i className="bi bi-dash-square"></i></div>
                  </button>
                ))}
                {unselToShow.map(item => (
                  <button key={item.uniqueKey} type="button" className="btn btn-category-outline modal-keyword-card" onClick={() => toggleKw(item.selectorKey, item.name)}>
                    <small className="d-block text-start opacity-75">{itemSubcategoryMap[item.id] || "Interest"}</small>
                    <div className="d-flex align-items-center gap-2"><span>{item.name}</span><i className="bi bi-plus-square"></i></div>
                  </button>
                ))}
                {allFiltered.length === 0 && (
                  <span className="text-muted w-100 text-center">
                    No results found.{' '}
                    {requestTerm && (
                      requestState === 'done' ? (
                        <span className="text-success">Keyword requested!</span>
                      ) : requestState === 'error' ? (
                        <span className="text-danger">Failed to request keyword.</span>
                      ) : (
                        <a
                          href="#"
                          style={{ textDecoration: 'underline', color: '#6D28D9' }}
                          onClick={async (e) => {
                            e.preventDefault();
                            await requestMissingKeyword(searchKey, requestTerm);
                          }}
                        >
                          {requestState === 'loading' ? 'Requesting...' : 'Click me to request keyword'}
                        </a>
                      )
                    )}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        {!isLoadingKw && hasMore && (
          <small className="text-muted d-block mt-1">Showing 100 of {filteredUnsel.length} results. Use the search bar to find more.</small>
        )}
      </div>
    );
  };

  // Renders yes / no toggle buttons
  const renderYesNo = (key) => (
    <div className="d-flex gap-2 mb-3">
      <button type="button"
        className={`btn ${answers[key] === "yes" ? "btn-primary" : "btn-outline-primary"}`}
        style={{ fontSize: "1rem", padding: "0.375rem 0.75rem" }}
        onClick={() => setAnswer(key, "yes")}>
        Yes
      </button>
      <button type="button"
        className={`btn ${answers[key] === "no" ? "btn-secondary" : "btn-outline-secondary"}`}
        style={{ fontSize: "1rem", padding: "0.375rem 0.75rem" }}
        onClick={() => setAnswer(key, "no")}>
        No
      </button>
    </div>
  );

  const handleContinue = () => {
    if (editStage === 1) {
      setValidated(true);
      const hasContact = (phoneNumber.trim() && showPhone) ||
        (instagramUsername.trim() && showInstagram) ||
        (tiktokUsername.trim() && showTiktok) ||
        (snapchatUsername.trim() && showSnapchat) ||
        (discordUsername.trim() && showDiscord);
      const firstNameTypeError = firstName.trim() && /\d/.test(firstName);
      const lastNameTypeError = lastName.trim() && /\d/.test(lastName);
      const countryCodeTypeError = countryCode && /[a-zA-Z]/.test(countryCode);
      const phoneTypeError = phoneNumber && /[a-zA-Z]/.test(phoneNumber);
      if (!firstName.trim() || !lastName.trim() || firstNameTypeError || lastNameTypeError || !selectedGender || !birthDay || !birthMonth || !birthYear || !location.trim() || !hasContact || countryCodeTypeError || phoneTypeError) {
        if (!hasContact) {
          setTimeout(() => {
            contactErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 0);
        }
        return;
      }
      setSelected(prev => {
        const next = { ...prev };
        if (firstStageCountryNames.length > 0) {
          next.places = [...firstStageCountryNames];
        } else {
          delete next.places;
        }
        return next;
      });
      setValidated(false);
      setEditStage(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ── Age gate: ban immediately if under 16 ────────────────────────────────
    const parsedDay = Number(birthDay);
    const parsedMonth = Number(birthMonth);
    const parsedYear = Number(birthYear);
    if (parsedYear && parsedMonth && parsedDay) {
      const dob = new Date(parsedYear, parsedMonth - 1, parsedDay);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const mDiff = today.getMonth() - dob.getMonth();
      if (mDiff < 0 || (mDiff === 0 && today.getDate() < dob.getDate())) age--;

      if (age < 16) {
        // Wipe all local profile state first so nothing is shown
        const blank = {
          firstName: "", lastName: "", birthDay: "", birthMonth: "", birthYear: "",
          location: "", countryCode: "", phoneNumber: "", showPhone: true,
          instagramUsername: "", showInstagram: true,
          tiktokUsername: "", showTiktok: true,
          snapchatUsername: "", showSnapchat: true,
          discordUsername: "", showDiscord: true,
          profileImagePreview: null, answers: {}, selected: {}, skipped: {},
          subscriptionStatus: "free", freeSearchesRemaining: 0, idType: 1,
        };
        setSavedProfile(blank);
        if (onProfileSave) onProfileSave(blank);
        setShowEditModal(false);

        // Ban account server-side (nulls out all profile data, sets is_banned=true,
        // suspension_reason='underage'). Fire-and-forget sign-out after.
        if (session?.user) {
          try {
            await supabase.rpc("ban_underage_account");
          } catch (err) {
            console.error("Failed to ban underage account:", err.message);
          } finally {
            await supabase.auth.signOut();
          }
        }

        navigate("/underage-banned", { replace: true });
        return;
      }
    }
    // ── End age gate ─────────────────────────────────────────────────────────

    const sanitizedAnswers = pickKeys(answers, yesNoKeys);
    const sanitizedSkipped = pickKeys(skipped, directKeys);
    const sanitizedSelected = sanitizeSelectedForProfile(
      selected,
      selectedGender,
      firstStageCountryNames
    );

    // Upload a newly selected image to the backend before saving the profile
    let finalImageUrl = profileImagePreview;
    if (_profileImage && session?.user) {
      try {
        finalImageUrl = await uploadProfilePicture(session.user.id, _profileImage);
        setProfileImagePreview(finalImageUrl);
        setProfileImage(null); // clear File object — already persisted
      } catch (err) {
        console.error("Failed to upload profile picture:", err.message);
        // fallback: keep the blob URL in the UI, but don't persist it
        finalImageUrl = null;
      }
    }

    const profile = {
      firstName, lastName,
      birthDay: formatBirthDatePart(birthDay),
      birthMonth: formatBirthDatePart(birthMonth),
      birthYear,
      location, countryCode, phoneNumber, showPhone,
      instagramUsername, showInstagram,
      tiktokUsername, showTiktok,
      snapchatUsername, showSnapchat,
      discordUsername, showDiscord,
      profileImagePreview: finalImageUrl ?? profileImagePreview,
      answers: sanitizedAnswers,
      selected: sanitizedSelected,
      skipped: sanitizedSkipped,
      subscriptionStatus: savedProfile.subscriptionStatus,
      freeSearchesRemaining: savedProfile.freeSearchesRemaining,
      idType: savedProfile.idType,
    };
    setAnswers(sanitizedAnswers);
    setSelected(sanitizedSelected);
    setSkipped(sanitizedSkipped);
    setSavedProfile(profile);
    if (onProfileSave) onProfileSave(profile);
    closeEditModal({ force: true });

    // Persist to DB if logged in
    if (session?.user) {
      try {
        // Resolve keyword names -> IDs inside each selector so duplicate labels
        // like "Other" keep the correct subcategory identity.
        const selectorItems = {
          visualArt: visualArtItems, digitalArt: digitalArtItems,
          musicGenres: musicGenreItems, musicArtists: musicArtistItems,
          musicSoft: musicSoftItems, instruments: instrumentItems,
          performing: performItems, writing: writingItems,
          movies: movieItems, tvShows: tvShowItems, anime: animeItems,
          games: gamingItems, memes: memeItems, apps: appItems,
          devices: deviceItems, designSoft: designSoftItems,
          progLang: progLangItems, ai: aiItems, subjects: subjectItems,
          careers: careerItems, personality: personalityItems, hobbies: hobbyItems,
          sexuality: sexualityItems, fitness: fitnessItems, sports: sportsItems,
          outdoor: outdoorItems, food: foodItems, places: placeItems,
          animals: animalItems, vehicles: vehicleItems, roleModels: roleModelItems,
          other: otherItems,
        };
        const keywordIds = Object.entries(sanitizedSelected)
          .flatMap(([key, names]) => {
            const items = selectorItems[key] || [];
            return (names || [])
              .map(name => items.find(item => item.name === name)?.id)
              .filter(id => id != null);
          });

        await updateUserProfile(
          session.user.id,
          {
            firstName, lastName, birthDay, birthMonth, birthYear,
            location, countryCode, phoneNumber, showPhone,
            instagramUsername, showInstagram,
            tiktokUsername, showTiktok,
            snapchatUsername, showSnapchat,
            discordUsername, showDiscord,
            profileImageUrl: finalImageUrl,
            answers: sanitizedAnswers,
            skipped: sanitizedSkipped,
          },
          keywordIds
        );
      } catch (err) {
        console.error("Failed to save profile to DB:", err.message);
      }
    }
  };

  // Progress counter
  const completedQuestions = yesNoKeys.filter(k => answers[k] != null).length
    + directKeys.filter(k => isDirectQuestionComplete(
      selected,
      skipped,
      k,
      selectedGender,
      firstStageCountryNames
    )).length;
  const totalQuestions = yesNoKeys.length + directKeys.length;
  const hasContact = (phoneNumber.trim() && showPhone) ||
    (instagramUsername.trim() && showInstagram) ||
    (tiktokUsername.trim() && showTiktok) ||
    (snapchatUsername.trim() && showSnapchat) ||
    (discordUsername.trim() && showDiscord);
  const basicPlanPrice = useMemo(
    () => getBasicPlanPrice(savedProfile.location),
    [savedProfile.location]
  );
  const isAdminUser = isAdmin;
  const showPricingNav = (
    session &&
    !isAdminUser &&
    !["active", "canceling"].includes(savedProfile.subscriptionStatus)
  );
  const showAdminNav = session && isAdminUser && routerLocation.pathname !== "/admin";
  const showChatNav = session && !isAdminUser;
  const showNotificationsNav = session && !isAdminUser;
  const chatBadgeLabel = unreadChatMessages > 99 ? "99+" : String(unreadChatMessages);
  const notificationBadgeLabel = unreadNotifications > 99 ? "99+" : String(unreadNotifications);
  const hasProAnalyticsAccess =
    isAdminUser ||
    savedProfile.subscriptionStatus === "active" ||
    savedProfile.subscriptionStatus === "canceling";
  const analyticsSummaryItems = [
    { label: "Total searches done", value: analytics.totalSearchesDone },
    { label: "Times you appeared in search", value: analytics.totalTimesSearched },
    {
      label: hasProAnalyticsAccess ? "Profile views (available below)" : "Profile views",
      value: analytics.totalProfileViews,
    },
  ];
  const getAnalyticsKeywordLabels = (viewer) => (
    viewer.keywordNames?.length
      ? viewer.keywordNames
      : (viewer.keywordIds || [])
      .map((id) => analyticsKeywordNameMap[id])
      .filter(Boolean)
  );

  return (
    <>
      <nav className="navbar navbar-expand-lg bg-body-tertiary">
        <div className="container-fluid">
          <Link className="navbar-brand" to="/">
            <img src={logo} alt="Logo" className="logo" /><span className="navbar-brand-text">LetsFindPeople</span>
          </Link>

          <div className="navbar-collapse" id="navbarNavDropdown">
            <ul className="navbar-nav ms-auto align-items-center">

              {showAdminNav && (
                <Link className="nav-link" to="/admin">
                  Admin
                </Link>
              )}

              {showChatNav && (
                <div className="nav-item">
                  <button
                    type="button"
                    className="navbar-chat-button position-relative"
                    onClick={openGlobalChat}
                    title="International chat"
                    aria-label="Open international chat"
                  >
                    <i className="bi bi-envelope"></i>
                    {unreadChatMessages > 0 && (
                      <span className="navbar-notification-badge position-absolute badge rounded-pill bg-danger">
                        {chatBadgeLabel}
                        <span className="visually-hidden">unread messages</span>
                      </span>
                    )}
                  </button>
                </div>
              )}

              {showNotificationsNav && (
                <div className="dropdown nav-item" ref={notificationsDropdownRef}>
                  <button
                    type="button"
                    className="navbar-chat-button position-relative"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                    title="Notifications"
                    aria-label="Open notifications"
                  >
                    <i className="bi bi-bell"></i>
                    {unreadNotifications > 0 && (
                      <span className="navbar-notification-badge position-absolute badge rounded-pill bg-danger">
                        {notificationBadgeLabel}
                        <span className="visually-hidden">unread notifications</span>
                      </span>
                    )}
                  </button>
                  <div
                    className="dropdown-menu dropdown-menu-end p-3 navbar-dropdown-panel navbar-notifications-dropdown"
                    ref={notificationsDropdownMenuRef}
                  >
                    {!session ? (
                      <div className="px-3 py-4 text-center text-muted">
                        <i className="bi bi-person-lock d-block fs-3 mb-2"></i>
                        Sign in to view notifications.
                      </div>
                    ) : notificationsLoading ? (
                      <div className="d-flex justify-content-center align-items-center py-4">
                        <div className="spinner-border spinner-border-sm text-primary" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    ) : notificationsError ? (
                      <div className="px-3 py-3 text-danger small">{notificationsError}</div>
                    ) : notifications.length === 0 ? (
                      <div className="px-3 py-4 text-center text-muted">
                        No notifications yet
                      </div>
                    ) : (
                      <div className="navbar-notifications-list">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`navbar-notification-item ${!notification.isRead ? "navbar-notification-item-unread" : ""}`}
                          >
                            <button
                              type="button"
                              className="btn navbar-notification-open text-start p-0 w-100 min-w-0"
                              onClick={() => openNotification(notification)}
                            >
                              <div className="d-flex align-items-center justify-content-between gap-2">
                                <span className="fw-semibold text-truncate navbar-notification-title">{notification.title}</span>
                                <small className="text-muted flex-shrink-0">
                                  {formatNotificationTimestamp(notification.createdAt)}
                                </small>
                              </div>
                              <small className="text-muted d-block text-truncate">
                                {notification.body}
                              </small>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pricing Dropdown */}
              {showPricingNav && (
                <div className="dropdown" style={{ position: "relative" }} ref={pricingDropdownRef}>
                  <a
                    className="nav-link dropdown-toggle"
                    href="#"
                    role="button"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                    ref={pricingDropdownToggleRef}
                  >
                    Pricing
                  </a>
                  <div
                    className="dropdown-menu dropdown-menu-end p-4 navbar-dropdown-panel navbar-pricing-dropdown"
                    ref={pricingDropdownMenuRef}
                  >
                    <div className="row align-items-center">
                      <h5 className="title mb-2">Free Plan</h5>
                      <p className="text mb-0">Access to <span>3 free searches</span> that renew daily.</p>
                    </div>
                    <div className="mb-3"></div>
                    <a
                      href="#"
                      className={`btn btn-primary w-100 mb-2${savedProfile.subscriptionStatus !== "active" ? " disabled" : ""}`}
                      aria-disabled={savedProfile.subscriptionStatus !== "active"}
                    >
                      {savedProfile.subscriptionStatus !== "active" ? "Current Plan" : "Upgrade"}
                    </a>

                    <hr />

                    <div className="row align-items-center">
                      <h5 className="title mb-2">Pro Plan</h5>
                      <p className="text mb-0">Access to <span>unlimited searches</span> and <span>see who viewed your profile</span>.</p>
                    </div>
                    <div className="mb-3"></div>
                    {savedProfile.subscriptionStatus === "active" ? (
                      <a href="#" className="btn btn-primary disabled w-100 mb-2" aria-disabled="true">
                        Current Plan
                      </a>
                    ) : (
                      <button
                        className="btn btn-primary w-100 mb-2"
                        onClick={session ? handleSubscribe : undefined}
                        disabled={checkoutLoading || !session}
                        title={!session ? "Sign in to subscribe" : undefined}
                      >
                        {checkoutLoading
                          ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          : `Subscribe for ${basicPlanPrice}/month`}
                      </button>
                    )}

                  </div>
                </div>
              )}

              {/* Meus Dados Dropdown */}
              {session && (
                <div className="dropdown">
                  <a className="nav-link dropdown-toggle profile-dropdown-toggle d-flex align-items-center gap-2" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <img
                      src={savedProfile.profileImagePreview || defaultProfile}
                      alt="Profile"
                      style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: "2px solid #dee2e6" }}
                    />
                    <span className="profile-dropdown-name">
                      {savedProfile.firstName || savedProfile.lastName
                        ? `${savedProfile.firstName} ${savedProfile.lastName}`.trim()
                        : session.user.email}
                    </span>
                  </a>

                  <ul className="dropdown-menu dropdown-menu-end">
                    <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); openEditProfile(); }}>Edit Profile</a></li>
                    {!isAdminUser && (
                      <>
                        <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); openAnalytics(); }}>Analytics</a></li>
                        <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setShowCancelSubModal(true); }}>Settings</a></li>
                      </>
                    )}
                    <li><a className="dropdown-item" href="#" onClick={handleLogout}>Logout</a></li>
                  </ul>
                </div>
              )}

              {/* Iniciar Sessão Dropdown */}
              {!session && (
                <div className="dropdown" ref={loginDropdownRef}>
                  <a
                    className="nav-link dropdown-toggle navbar-login-toggle"
                    href="#"
                    role="button"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                    ref={loginDropdownToggleRef}
                  >
                    Sign Up | Login
                  </a>
                  <div className="dropdown-menu dropdown-menu-end p-4 navbar-dropdown-panel navbar-login-dropdown" ref={loginDropdownMenuRef}>
                    <h5 className="navbar-login-heading">Join and find people with your interests:</h5>

                    <div className="mb-3"></div>

                    <button
                      type="button"
                      className="btn btn-google w-100 d-flex align-items-center justify-content-center gap-2"
                      onClick={handleGoogleLogin}
                      disabled={googleLoading}
                    >
                      {googleLoading ? (
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      ) : (
                        <svg className="google-login-mark" viewBox="0 0 18 18" aria-hidden="true">
                          <path fill="#4285f4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                          <path fill="#34a853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.35 0-4.34-1.58-5.05-3.72H.94v2.33A9 9 0 0 0 9 18z" />
                          <path fill="#fbbc05" d="M3.95 10.7A5.41 5.41 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.03l3.01-2.33z" />
                          <path fill="#ea4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .94 4.97L3.95 7.3C4.66 5.16 6.65 3.58 9 3.58z" />
                        </svg>
                      )}
                      <span>Continue with Google</span>
                    </button>

                    {authError && <div className="text-danger mt-2" style={{ fontSize: "0.875em" }}>{authError}</div>}
                  </div>
                </div>
              )}
            </ul>
          </div>
        </div>
      </nav>

      {/* Global Chat Modal */}
      {showChatModal && (
        <>
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="globalChatTitle">
            <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title" id="globalChatTitle">International Chat</h5>
                  <button type="button" className="btn-close" onClick={closeGlobalChat} aria-label="Close"></button>
                </div>

                <div
                  className="modal-body bg-light"
                  ref={chatMessagesBodyRef}
                  style={{ height: "320px", overflowY: "auto" }}
                >
                  {chatError && (
                    <div className="alert alert-danger py-2" role="alert">
                      {chatError}
                    </div>
                  )}

                  {!session ? (
                    <div className="d-flex h-100 flex-column align-items-center justify-content-center text-center text-muted">
                      <i className="bi bi-person-lock d-block fs-1 mb-2"></i>
                      Sign in to chat with everyone.
                    </div>
                  ) : chatLoading ? (
                    <div className="d-flex justify-content-center align-items-center py-5">
                      <div className="spinner-border spinner-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="d-flex h-100 flex-column align-items-center justify-content-center text-center text-muted">
                      <i className="bi bi-chat-square-dots d-block fs-1 mb-2"></i>
                      No messages yet
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {chatMessages.map((message, index) => {
                        const isOwnMessage = message.author?.email === session?.user?.email;
                        const nextMessage = chatMessages[index + 1];
                        const showMessageTime = !nextMessage || nextMessage.userId !== message.userId;
                        return (
                          <div
                            key={message.id}
                            className={`d-flex ${isOwnMessage ? "justify-content-end" : "justify-content-start gap-2 align-items-start"}`}
                          >
                            {isOwnMessage ? (
                              <div className="w-75 d-flex flex-column align-items-end">
                                <div className="rounded-3 p-2 text-break text-white global-chat-message-own">
                                  {message.body}
                                </div>
                                {showMessageTime && (
                                  <small className="text-muted mt-1 text-end">
                                    {formatChatTimestamp(message.createdAt)}
                                  </small>
                                )}
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn p-0 border-0 bg-transparent flex-shrink-0 global-chat-avatar-button"
                                  onClick={() => openChatAuthorInConsole(message)}
                                  aria-label={`Show ${getChatAuthorName(message)} in search`}
                                >
                                  <img
                                    src={message.author?.profileUrl || defaultProfile}
                                    alt={getChatAuthorName(message)}
                                    width="28"
                                    height="28"
                                    className="rounded-circle global-chat-avatar"
                                  />
                                </button>
                                <div className="w-75 d-flex flex-column align-items-start">
                                  <button
                                    type="button"
                                    className="global-chat-author-button mb-1"
                                    onClick={() => openChatAuthorInConsole(message)}
                                  >
                                    {getChatAuthorName(message)}
                                  </button>
                                  <div className="rounded-3 p-2 text-break bg-white border">
                                    {message.body}
                                  </div>
                                  {showMessageTime && (
                                    <small className="text-muted mt-1">
                                      {formatChatTimestamp(message.createdAt)}
                                    </small>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <form className="modal-footer" onSubmit={handleChatSubmit}>
                  <div className="input-group">
                    <label htmlFor="globalChatMessage" className="visually-hidden">Message</label>
                    <input
                      type="text"
                      id="globalChatMessage"
                      className="form-control"
                      placeholder={session ? "Message everyone..." : "Sign in to send messages..."}
                      value={chatDraft}
                      maxLength={CHAT_MAX_MESSAGE_LENGTH}
                      disabled={!session}
                      onChange={(e) => setChatDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleChatSubmit(e);
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={!session || !chatDraft.trim() || chatSending}
                    >
                      {chatSending ? (
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      ) : (
                        <>
                          <i className="bi bi-send me-1"></i>
                          Send
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {/* Notification Detail Modal */}
      {selectedNotification && (
        <>
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-label="Notification details">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <span className="text-muted small">
                    {formatChatTimestamp(selectedNotification.createdAt)}
                  </span>
                  <button type="button" className="btn-close" onClick={() => setSelectedNotification(null)} aria-label="Close"></button>
                </div>
                <div className="modal-body">
                  {selectedNotification.coverUrl && (
                    <div className="ratio ratio-16x9 mb-3 bg-light rounded overflow-hidden">
                      <img
                        src={selectedNotification.coverUrl}
                        alt=""
                        className="w-100 h-100 object-fit-cover"
                      />
                    </div>
                  )}
                  <p className="fw-semibold mb-2">
                    {selectedNotification.title}
                  </p>
                  <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                    {selectedNotification.body}
                  </p>
                  {selectedNotification.isDrawEvent && (
                    <div className="mt-3">
                      <label htmlFor="drawEventInviteLink" className="visually-hidden">Draw Event Invite</label>
                      {selectedNotification.isDisabled ? (
                        <input
                          id="drawEventInviteLink"
                          type="text"
                          className="form-control"
                          value="Draw event ended."
                          readOnly
                        />
                      ) : drawInviteCompleted ? (
                        <input
                          id="drawEventInviteLink"
                          type="text"
                          className="form-control"
                          value="Congratulations, someone used your link."
                          readOnly
                        />
                      ) : (
                        <div className="input-group">
                          <input
                            id="drawEventInviteLink"
                            type="text"
                            className="form-control"
                            value={drawInviteLink}
                            readOnly
                            disabled={drawInviteLoading || !!drawInviteError}
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={shareDrawInviteLink}
                            disabled={!drawInviteLink || drawInviteLoading}
                          >
                            Share
                          </button>
                        </div>
                      )}
                      {drawInviteLoading && (
                        <small className="text-muted d-block mt-1">Getting invite link...</small>
                      )}
                      {drawInviteError && (
                        <small className="text-danger d-block mt-1">{drawInviteError}</small>
                      )}
                      {drawInviteShareNotice && (
                        <small className="text-muted d-block mt-1" aria-live="polite">
                          {drawInviteShareNotice}
                        </small>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {/* Analytics Modal */}
      {showAnalyticsModal && (
        <>
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="analyticsTitle">
            <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title" id="analyticsTitle">Analytics</h5>
                  <button type="button" className="btn-close" onClick={() => setShowAnalyticsModal(false)} aria-label="Close"></button>
                </div>
                <div className="modal-body">
                  {analyticsLoading ? (
                    <div className="d-flex justify-content-center align-items-center py-5">
                      <div className="spinner-border spinner-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : analyticsError ? (
                    <div className="alert alert-danger mb-0" role="alert">
                      {analyticsError}
                    </div>
                  ) : (
                    <>
                      <div className="analytics-summary-grid">
                        {analyticsSummaryItems.map((item) => (
                          <div key={item.label} className="analytics-summary-tile">
                            <div className="analytics-summary-value">
                              {Number(item.value || 0).toLocaleString()}
                            </div>
                            <div className="analytics-summary-label">{item.label}</div>
                          </div>
                        ))}
                      </div>

                      <hr className="my-3" />

                      {!hasProAnalyticsAccess ? (
                        <div className="text-muted text-center py-4">
                          Upgrade to the{" "}
                          <a
                            href="#"
                            className="analytics-upgrade-link"
                            onClick={(event) => {
                              event.preventDefault();
                              setShowAnalyticsModal(false);
                              window.dispatchEvent(new CustomEvent("lfp:open-pricing"));
                            }}
                          >
                            Pro Plan
                          </a>{" "}
                          to see who viewed your profile.
                        </div>
                      ) : analytics.viewers.length === 0 ? (
                        <div className="text-muted text-center py-4">
                          No profile views yet
                        </div>
                      ) : (
                        <div className="analytics-viewers-list">
                          {analytics.viewers.map((viewer, index) => {
                            const keywordLabels = getAnalyticsKeywordLabels(viewer);

                            return (
                              <div key={viewer.id || `${viewer.viewerUserId}-${index}`}>
                                <div className="analytics-viewer-row">
                                  <div className="analytics-viewer-person">
                                    <img
                                      src={viewer.viewerProfileUrl || defaultProfile}
                                      alt={viewer.viewerName}
                                      className="analytics-viewer-avatar"
                                    />
                                    <span className="analytics-viewer-name">{viewer.viewerName}</span>
                                  </div>
                                  {viewer.createdAt && (
                                    <div className="analytics-viewer-time">
                                      {formatAnalyticsViewTime(viewer.createdAt)}
                                    </div>
                                  )}
                                  <div className="analytics-viewer-keywords">
                                    {keywordLabels.length > 0 ? keywordLabels.join(", ") : "Direct profile view"}
                                  </div>
                                </div>
                                {index < analytics.viewers.length - 1 && <hr className="analytics-viewer-divider" />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {/* Settings Modal */}
      {showCancelSubModal && (
        <div className="modal" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Settings</h5>
                <button type="button" className="btn-close" onClick={() => setShowCancelSubModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="settings-account-row d-flex align-items-center justify-content-between mb-3">
                  <div className="settings-email-block">
                    <div>Email</div>
                    <div className="settings-email-value">{session?.user?.email}</div>
                  </div>
                  <a
                    href="#"
                    className="text-purple settings-action-link"
                    style={{ color: "#6D28D9" }}
                    onClick={async (e) => {
                      e.preventDefault();
                      if (!window.confirm("Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.")) return;
                      try {
                        if (session?.user) await deleteUser(session.user.id);
                        await supabase.auth.signOut();
                        setShowCancelSubModal(false);
                      } catch (err) {
                        alert("Failed to delete account: " + err.message);
                      }
                    }}
                  >
                    Delete Account
                  </a>
                </div>

                {(savedProfile.subscriptionStatus === "active" || savedProfile.subscriptionStatus === "canceling") && (
                  <div className="d-flex align-items-center justify-content-between">
                    <div>
                      <div>
                        {savedProfile.subscriptionStatus === "active"
                          ? "Pro Plan"
                          : savedProfile.subscriptionStatus === "canceling"
                            ? "Pro Plan (canceling)"
                            : "Free Plan"}
                      </div>
                      <div>
                        {subscriptionDetails.loading
                          ? "Loading payment date..."
                          : subscriptionDetails.currentPeriodEnd
                            ? `${savedProfile.subscriptionStatus === "canceling" ? "Active until" : "Next payment"}: ${formatStripeDate(subscriptionDetails.currentPeriodEnd)}`
                            : subscriptionDetails.error || "Payment date unavailable"}
                      </div>
                    </div>
                    {(savedProfile.subscriptionStatus === "active" || savedProfile.subscriptionStatus === "canceling") && (
                      <a
                        href="#"
                        className="text-purple"
                        style={{ color: "#6D28D9" }}
                        onClick={handleCancelSubscription}
                      >
                        {cancelLoading
                          ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          : savedProfile.subscriptionStatus === "canceling"
                            ? "Cancel Now"
                            : "Cancel Plan"}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditModal && (
        <div className="modal" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Profile</h5>
                {!mustCompleteProfile && (
                  <button type="button" className="btn-close" onClick={closeEditModal}></button>
                )}
              </div>

              <div className="modal-body">
                {/* Stage 1: Name Form */}
                {editStage === 1 && (
                  <form noValidate style={{ maxHeight: "55vh", overflowY: "auto", overflowX: "hidden", paddingRight: "4px" }}>
                    {/* Profile Picture */}
                    <div className="mb-3 text-center">
                      <label className="form-label d-block">Profile Picture <span className="text-muted fw-normal" style={{ fontSize: "0.85em" }}>(Optional)</span></label>
                      {profileImagePreview ? (
                        <div className="d-flex flex-column align-items-center gap-2">
                          <img
                            src={profileImagePreview}
                            alt="Profile preview"
                            style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", border: "2px solid #dee2e6" }}
                          />
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={removeProfileImage}>
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="profileImageInput"
                          className="d-flex flex-column align-items-center justify-content-center"
                          style={{ width: 96, height: 96, borderRadius: "50%", border: "2px dashed #adb5bd", cursor: "pointer", margin: "0 auto", color: "#adb5bd" }}
                        >
                          <i className="bi bi-camera" style={{ fontSize: "1.5rem" }}></i>
                          <small style={{ fontSize: "0.7rem" }}>Upload</small>
                        </label>
                      )}
                      <input
                        type="file"
                        id="profileImageInput"
                        accept="image/*"
                        className="d-none"
                        onClick={e => { e.target.value = null; }}
                        onChange={handleProfileImageChange}
                      />
                      {profileImageSizeError && (
                        <div className="text-danger mt-2" style={{ fontSize: "0.875em" }}>Image must be smaller than 3 MB.</div>
                      )}
                    </div>

                    {/* Name & Gender Row */}
                    <div className="row g-2 flex-nowrap">
                      <div className="col-4 mb-3">
                        <label htmlFor="firstName" className="form-label">First Name</label>
                        <input
                          type="text"
                          className={`form-control${(validated && !firstName.trim()) || /\d/.test(firstName) ? " is-invalid" : ""}`}
                          id="firstName"
                          placeholder="Enter your first name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                        />
                        <div className="invalid-feedback">
                          {/\d/.test(firstName) ? "First name should not contain numbers." : "Please enter your first name."}
                        </div>
                      </div>
                      <div className="col-4 mb-3">
                        <label htmlFor="lastName" className="form-label">Last Name</label>
                        <input
                          type="text"
                          className={`form-control${(validated && !lastName.trim()) || /\d/.test(lastName) ? " is-invalid" : ""}`}
                          id="lastName"
                          placeholder="Enter your last name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
                        />
                        <div className="invalid-feedback">
                          {/\d/.test(lastName) ? "Last name should not contain numbers." : "Please enter your last name."}
                        </div>
                      </div>
                      <div className="col-4 mb-3">
                        <label htmlFor="gender" className="form-label">Gender</label>
                        <select
                          id="gender"
                          className={`form-select${validated && !selectedGender ? " is-invalid" : ""}`}
                          value={selectedGender}
                          onChange={(e) => setGenderSelection(e.target.value)}
                          required
                        >
                          <option value="">Select</option>
                          {GENDER_KEYWORDS.map(gender => (
                            <option key={gender} value={gender}>{gender}</option>
                          ))}
                        </select>
                        <div className="invalid-feedback">Please select your gender.</div>
                      </div>
                    </div>

                    {/* Birth Date */}
                    <div className="mb-3">
                      <label className="form-label">Date of Birth</label>
                      <div className="d-flex gap-2">
                        <select className={`form-select${validated && !birthDay ? " is-invalid" : ""}`} value={birthDay} onChange={(e) => setBirthDay(e.target.value)} required>
                          <option value="">Day</option>
                          {Array.from(
                            { length: birthMonth ? new Date(birthYear || 2000, Number(birthMonth), 0).getDate() : 31 },
                            (_, i) => i + 1
                          ).map(d => (
                            <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
                          ))}
                        </select>
                        <select className={`form-select${validated && !birthMonth ? " is-invalid" : ""}`} value={birthMonth} onChange={(e) => {
                          const newMonth = e.target.value;
                          setBirthMonth(newMonth);
                          if (birthDay && newMonth) {
                            const maxDays = new Date(birthYear || 2000, Number(newMonth), 0).getDate();
                            if (Number(birthDay) > maxDays) setBirthDay("");
                          }
                        }}>
                          <option value="">Month</option>
                          {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                            <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>
                          ))}
                        </select>
                        <select className={`form-select${validated && !birthYear ? " is-invalid" : ""}`} value={birthYear} onChange={(e) => {
                          const newYear = e.target.value;
                          setBirthYear(newYear);
                          if (birthDay && birthMonth) {
                            const maxDays = new Date(newYear || 2000, Number(birthMonth), 0).getDate();
                            if (Number(birthDay) > maxDays) setBirthDay("");
                          }
                        }}>
                          <option value="">Year</option>
                          {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>                    {validated && (!birthDay || !birthMonth || !birthYear) && (
                        <div className="text-danger" style={{ fontSize: "0.875em", marginTop: "0.25rem" }}>Please select your full date of birth.</div>
                      )}                  </div>

                    {/* Location & Phone Number Row */}
                    <div className="row">
                      <div className="col-12 col-md-6 mb-3">
                        <label htmlFor="location" className="form-label">Location</label>
                        <div className="input-group has-validation">
                          <input
                            type="text"
                            className={`form-control${validated && !location.trim() ? " is-invalid" : ""}`}
                            id="location"
                            placeholder="City, Country"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={detectLocation}
                            disabled={locatingUser}
                          >
                            {locatingUser ? (
                              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                            ) : (
                              <i className="bi bi-geo-alt"></i>
                            )}
                          </button>
                          <div className="invalid-feedback">Please enter your location.</div>
                        </div>
                      </div>

                      <div className="col-12 col-md-6 mb-3">
                        <label htmlFor="phoneNumber" className="form-label">Phone Number <span className="text-muted fw-normal" style={{ fontSize: "0.85em" }}>(Optional)</span></label>
                        <div className="input-group">
                          <input
                            type="text"
                            className={`form-control${countryCode && /[a-zA-Z]/.test(countryCode) ? " is-invalid" : ""}`}
                            placeholder="+1"
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            style={{ maxWidth: "65px" }}
                          />
                          <input
                            type="tel"
                            className={`form-control${(validated && !hasContact) || (phoneNumber && /[a-zA-Z]/.test(phoneNumber)) ? " is-invalid" : ""}`}
                            id="phoneNumber"
                            placeholder="Phone number"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                          />
                          <button type="button" className="btn btn-primary" onClick={() => setShowPhone(p => !p)} title={showPhone ? "Hide from profile" : "Show in profile"}>
                            <i className={`bi bi-eye${showPhone ? "" : "-slash"}`}></i>
                          </button>
                        </div>
                        {countryCode && /[a-zA-Z]/.test(countryCode) && (
                          <div className="text-danger" style={{ fontSize: "0.875em", marginTop: "0.25rem" }}>Country code should contain only + and digits.</div>
                        )}
                        {phoneNumber && /[a-zA-Z]/.test(phoneNumber) && (
                          <div className="text-danger" style={{ fontSize: "0.875em", marginTop: "0.25rem" }}>Phone number should contain only digits.</div>
                        )}
                      </div>
                    </div>

                    {/* Social Usernames - 2x2 grid */}
                    <div className="row">
                      {/* Instagram */}
                      <div className="col-12 col-md-6 mb-3">
                        <label htmlFor="instagramUsername" className="form-label">Instagram <span className="text-muted fw-normal" style={{ fontSize: "0.85em" }}>(Optional)</span></label>
                        <div className="input-group">
                          <input
                            type="text"
                            className={`form-control${validated && !hasContact ? " is-invalid" : ""}`}
                            id="instagramUsername"
                            placeholder="Username123"
                            value={instagramUsername}
                            onChange={(e) => setInstagramUsername(e.target.value)}
                          />
                          <button type="button" className="btn btn-primary" onClick={() => setShowInstagram(p => !p)} title={showInstagram ? "Hide from profile" : "Show in profile"}>
                            <i className={`bi bi-eye${showInstagram ? "" : "-slash"}`}></i>
                          </button>
                        </div>
                      </div>

                      {/* TikTok */}
                      <div className="col-12 col-md-6 mb-3">
                        <label htmlFor="tiktokUsername" className="form-label">TikTok <span className="text-muted fw-normal" style={{ fontSize: "0.85em" }}>(Optional)</span></label>
                        <div className="input-group">
                          <input
                            type="text"
                            className={`form-control${validated && !hasContact ? " is-invalid" : ""}`}
                            id="tiktokUsername"
                            placeholder="Username123"
                            value={tiktokUsername}
                            onChange={(e) => setTiktokUsername(e.target.value)}
                          />
                          <button type="button" className="btn btn-primary" onClick={() => setShowTiktok(p => !p)} title={showTiktok ? "Hide from profile" : "Show in profile"}>
                            <i className={`bi bi-eye${showTiktok ? "" : "-slash"}`}></i>
                          </button>
                        </div>
                      </div>

                      {/* Snapchat */}
                      <div className="col-12 col-md-6 mb-3">
                        <label htmlFor="snapchatUsername" className="form-label">Snapchat <span className="text-muted fw-normal" style={{ fontSize: "0.85em" }}>(Optional)</span></label>
                        <div className="input-group">
                          <input
                            type="text"
                            className={`form-control${validated && !hasContact ? " is-invalid" : ""}`}
                            id="snapchatUsername"
                            placeholder="Username123"
                            value={snapchatUsername}
                            onChange={(e) => setSnapchatUsername(e.target.value)}
                          />
                          <button type="button" className="btn btn-primary" onClick={() => setShowSnapchat(p => !p)} title={showSnapchat ? "Hide from profile" : "Show in profile"}>
                            <i className={`bi bi-eye${showSnapchat ? "" : "-slash"}`}></i>
                          </button>
                        </div>
                      </div>

                      {/* Discord */}
                      <div className="col-12 col-md-6 mb-3">
                        <label htmlFor="discordUsername" className="form-label">Discord <span className="text-muted fw-normal" style={{ fontSize: "0.85em" }}>(Optional)</span></label>
                        <div className="input-group">
                          <input
                            type="text"
                            className={`form-control${validated && !hasContact ? " is-invalid" : ""}`}
                            id="discordUsername"
                            placeholder="Username123"
                            value={discordUsername}
                            onChange={(e) => setDiscordUsername(e.target.value)}
                          />
                          <button type="button" className="btn btn-primary" onClick={() => setShowDiscord(p => !p)} title={showDiscord ? "Hide from profile" : "Show in profile"}>
                            <i className={`bi bi-eye${showDiscord ? "" : "-slash"}`}></i>
                          </button>
                        </div>
                      </div>
                    </div>
                    {validated && !hasContact && (
                      <div ref={contactErrorRef} className="text-danger" style={{ fontSize: "0.875em", marginTop: "0.25rem" }}>Please add and show at least one contact (phone number or username).</div>
                    )}

                  </form>
                )}

                {/* Stage 2: Interest Questions */}
                {editStage === 2 && (
                  <div style={{ maxHeight: "55vh", overflowY: "auto", paddingRight: "4px" }}>
                    {catalogLoading && (
                      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "200px" }}>
                        <div className="spinner-border spinner-primary" role="status">
                          <span className="visually-hidden">Loading keywords…</span>
                        </div>
                      </div>
                    )}
                    {!catalogLoading && (
                      <>
                        {/* Q1 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">1- Do you make physical or digital art?</p>
                          {renderYesNo("visualArt")}
                          {answers.visualArt === "yes" && (
                            <>
                              <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any interests you have in physical or digital art.</p>
                              {renderCombinedKeywords("art", [
                                { key: "visualArt", items: visualArtItems },
                                { key: "digitalArt", items: digitalArtItems },
                                { key: "designSoft", items: designSoftItems },
                              ])}
                            </>
                          )}
                        </div>

                        {/* Q2 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">2- Do you listen to music?</p>
                          {renderYesNo("listenMusic")}
                          {answers.listenMusic === "yes" && (
                            <>
                              <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select the music genres you like.</p>
                              {renderKeywords("musicGenres", musicGenreItems, false)}
                              <p className="text-muted mt-3 mb-2" style={{ fontSize: 14 }}>Select any albums, songs, artists, singers, or bands you like.</p>
                              {renderKeywords("musicArtists", musicArtistItems, false)}
                            </>
                          )}
                        </div>

                        {/* Q3 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">3- Do you produce music or play instruments?</p>
                          {renderYesNo("produceMusic")}
                          {answers.produceMusic === "yes" && (
                            <>
                              <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any music software you use or instruments you play.</p>
                              {renderCombinedKeywords("musicMaking", [
                                { key: "musicSoft", items: musicSoftItems },
                                { key: "instruments", items: instrumentItems },
                              ])}
                            </>
                          )}
                        </div>

                        {/* Q4 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">4- Search any movies or movie characters you like.</p>
                          {renderKeywords("movies", movieItems, true)}
                        </div>

                        {/* Q5 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">5- Search any TV shows or TV show characters you like.</p>
                          {renderKeywords("tvShows", tvShowItems, true)}
                        </div>

                        {/* Q6 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">6- Do you like anime?</p>
                          {renderYesNo("likeAnime")}
                          {answers.likeAnime === "yes" && (
                            <>
                              <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any anime or characters you like.</p>
                              {renderKeywords("anime", animeItems, false)}
                            </>
                          )}
                        </div>

                        {/* Q7 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">7- Do you like video games?</p>
                          {renderYesNo("likeGames")}
                          {answers.likeGames === "yes" && (
                            <>
                              <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any video games you have played or like.</p>
                              {renderKeywords("games", gamingItems, false)}
                            </>
                          )}
                        </div>

                        {/* Q8 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">8- Do you like programming?</p>
                          {renderYesNo("likeProgramming")}
                          {answers.likeProgramming === "yes" && (
                            <>
                              <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any programming languages or game development engines you like.</p>
                              {renderKeywords("progLang", progLangItems, false)}
                            </>
                          )}
                        </div>

                        {/* Q9 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">9- Are you currently in school or university?</p>
                          {renderYesNo("attendEducation")}
                          {answers.attendEducation === "yes" && (
                            <>
                              <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select your favourite subjects.</p>
                              {renderKeywords("subjects", subjectItems, false)}
                            </>
                          )}
                        </div>

                        {/* Q10 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">10- Select your personality.</p>
                          {renderKeywords("personality", personalityItems, true)}
                        </div>

                        {/* Q11 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">11- Select any hobbies you have.</p>
                          {renderKeywords("hobbies", hobbyItems, true)}
                        </div>

                        {/* Q12 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">12- Do you work out, practice sports, or like outdoor physical activities?</p>
                          {renderYesNo("goGym")}
                          {answers.goGym === "yes" && (
                            <>
                              <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any fitness, sports, or outdoor physical activities you like.</p>
                              {renderCombinedKeywords("activeLifestyle", [
                                { key: "fitness", items: fitnessItems },
                                { key: "sports", items: sportsItems },
                                { key: "outdoor", items: outdoorItems },
                              ])}
                            </>
                          )}
                        </div>

                        {/* Q13 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">13- Select any people or role models you follow.</p>
                          {renderKeywords("roleModels", roleModelItems, true)}
                        </div>

                        {/* Q14 */}
                        <div className="mb-4">
                          <p className="fw-semibold mb-2">14- Select any other interests you have.</p>
                          {renderKeywords("other", otherItems, true)}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <div className="d-flex w-100 justify-content-end">
                  {editStage === 2 && (
                    <span className="me-auto text-muted" style={{ fontSize: "0.9rem" }}>
                      {completedQuestions} of {totalQuestions} completed
                    </span>
                  )}
                  {editStage === 1 && (
                    <>
                      <button type="button" className="btn btn-primary" onClick={handleContinue}>
                        Continue
                      </button>
                    </>
                  )}
                  {editStage === 2 && (
                    <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={completedQuestions < totalQuestions}>
                      Save
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
