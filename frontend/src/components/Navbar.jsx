import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import defaultProfile from "../assets/default-profile.jpg";
import { useDbData } from "../context/DbDataContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { updateUserProfile, deleteUser, getUserProfile, uploadProfilePicture } from "../lib/userService";
import { requestKeyword } from "../lib/catalogService";

import "./Navbar.css";

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

function Navbar({ onProfileSave }) {
  const { dbData, isLoading: catalogLoading } = useDbData();
  const { session } = useAuth();
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const loginDropdownToggleRef = useRef(null);

  const [otherKeywordRequestStatus, setOtherKeywordRequestStatus] = useState(null); // null | 'loading' | 'done' | 'error'

  // ── Derive item lists from catalog (all empty until catalog loads) ─────────
  const visualArtItems   = useMemo(() => dbData?.categories[0]?.subcategories[0]?.items ?? [], [dbData]);
  const digitalArtItems  = useMemo(() => dbData?.categories[0]?.subcategories[1]?.items ?? [], [dbData]);
  const musicItems       = useMemo(() => dbData?.categories[0]?.subcategories[2]?.items ?? [], [dbData]);
  const musicGenreItems  = useMemo(() => musicItems.filter(i => i.id <= 280), [musicItems]);
  const instrumentItems  = useMemo(() => musicItems.filter(i => i.id >= 281 && i.id <= 389), [musicItems]);
  const musicArtistItems = useMemo(() => musicItems.filter(i => i.id >= 390), [musicItems]);
  const performItems     = useMemo(() => dbData?.categories[0]?.subcategories[3]?.items ?? [], [dbData]);
  const writingItems     = useMemo(() => dbData?.categories[0]?.subcategories[4]?.items ?? [], [dbData]);
  const movieItems       = useMemo(() => dbData?.categories[1]?.subcategories[0]?.items ?? [], [dbData]);
  const tvShowItems      = useMemo(() => dbData?.categories[1]?.subcategories[1]?.items ?? [], [dbData]);
  const animeItems       = useMemo(() => dbData?.categories[1]?.subcategories[2]?.items ?? [], [dbData]);
  const gamingItems      = useMemo(() => dbData?.categories[1]?.subcategories[4]?.items ?? [], [dbData]);
  const memeItems        = useMemo(() => dbData?.categories[1]?.subcategories[6]?.items ?? [], [dbData]);
  const deviceItems      = useMemo(() => dbData?.categories[2]?.subcategories[0]?.items ?? [], [dbData]);
  const appItems         = useMemo(() => dbData?.categories[2]?.subcategories[1]?.items ?? [], [dbData]);
  const designSoftItems  = useMemo(() => dbData?.categories[2]?.subcategories[2]?.items ?? [], [dbData]);
  const musicSoftItems   = useMemo(() => dbData?.categories[2]?.subcategories[3]?.items ?? [], [dbData]);
  const progLangItems    = useMemo(() => [
    ...(dbData?.categories[2]?.subcategories[5]?.items ?? []),
    ...(dbData?.categories[2]?.subcategories[4]?.items ?? []),
  ], [dbData]);
  const aiItems          = useMemo(() => dbData?.categories[2]?.subcategories[6]?.items ?? [], [dbData]);
  const subjectItems     = useMemo(() => dbData?.categories[3]?.subcategories[0]?.items ?? [], [dbData]);
  const careerItems      = useMemo(() => dbData?.categories[3]?.subcategories[3]?.items ?? [], [dbData]);
  const personalityItems = useMemo(() => dbData?.categories[4]?.subcategories[0]?.items ?? [], [dbData]);
  const hobbyItems       = useMemo(() => [
    ...(dbData?.categories[4]?.subcategories[7]?.items ?? []),
    ...(dbData?.categories[4]?.subcategories[6]?.items ?? []),
  ], [dbData]);
  const sexualityItems   = useMemo(() => dbData?.categories[4]?.subcategories[3]?.items ?? [], [dbData]);
  const sportsItems      = useMemo(() => dbData?.categories[5]?.subcategories[0]?.items ?? [], [dbData]);
  const fitnessItems     = useMemo(() => dbData?.categories[5]?.subcategories[1]?.items ?? [], [dbData]);
  const outdoorItems     = useMemo(() => dbData?.categories[5]?.subcategories[2]?.items ?? [], [dbData]);
  const foodItems        = useMemo(() => [
    ...(dbData?.categories[6]?.subcategories[0]?.items ?? []),
    ...(dbData?.categories[6]?.subcategories[1]?.items ?? []),
    ...(dbData?.categories[6]?.subcategories[2]?.items ?? []),
    ...(dbData?.categories[6]?.subcategories[3]?.items ?? []),
  ], [dbData]);
  const countryItems     = useMemo(() => dbData?.categories[7]?.subcategories[0]?.items ?? [], [dbData]);
  const cityItems        = useMemo(() => dbData?.categories[7]?.subcategories[1]?.items ?? [], [dbData]);
  const placeItems       = useMemo(() => [
    ...countryItems,
    ...cityItems,
    ...(dbData?.categories[7]?.subcategories[2]?.items ?? []),
  ], [dbData, countryItems, cityItems]);
  const animalItems      = useMemo(() => dbData?.categories[7]?.subcategories[3]?.items ?? [], [dbData]);
  const vehicleItems     = useMemo(() => [
    ...(dbData?.categories[8]?.subcategories[0]?.items ?? []),
    ...(dbData?.categories[8]?.subcategories[1]?.items ?? []),
    ...(dbData?.categories[8]?.subcategories[2]?.items ?? []),
  ], [dbData]);
  const carItemIds       = useMemo(() => new Set((dbData?.categories[8]?.subcategories[0]?.items ?? []).map(i => i.id)), [dbData]);
  const motoItemIds      = useMemo(() => new Set((dbData?.categories[8]?.subcategories[1]?.items ?? []).map(i => i.id)), [dbData]);
  const roleModelItems   = useMemo(() => dbData?.categories[9]?.subcategories[0]?.items ?? [], [dbData]);
  const otherItems       = useMemo(() => (dbData?.categories ?? []).flatMap(cat => cat.subcategories.flatMap(sub => sub.items)), [dbData]);

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

  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showCancelSubModal, setShowCancelSubModal] = useState(false);
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
  const [showPhone, setShowPhone] = useState(false);
  const [instagramUsername, setInstagramUsername] = useState("");
  const [showInstagram, setShowInstagram] = useState(false);
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [showTiktok, setShowTiktok] = useState(false);
  const [snapchatUsername, setSnapchatUsername] = useState("");
  const [showSnapchat, setShowSnapchat] = useState(false);
  const [discordUsername, setDiscordUsername] = useState("");
  const [showDiscord, setShowDiscord] = useState(false);
  const [_profileImage, setProfileImage] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(null);
  const [profileImageSizeError, setProfileImageSizeError] = useState(false);

  const handleProfileImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) {
      setProfileImageSizeError(true);
      setProfileImage(null);
      setProfileImagePreview(null);
      return;
    }
    setProfileImageSizeError(false);
    setProfileImage(file);
    setProfileImagePreview(URL.createObjectURL(file));
  };

  const removeProfileImage = () => {
    setProfileImage(null);
    setProfileImagePreview(null);
    setProfileImageSizeError(false);
  };

  const [savedProfile, setSavedProfile] = useState({
    firstName: "", lastName: "", birthDay: "", birthMonth: "", birthYear: "",
    location: "", countryCode: "", phoneNumber: "", showPhone: false,
    instagramUsername: "", showInstagram: false,
    tiktokUsername: "", showTiktok: false,
    snapchatUsername: "", showSnapchat: false,
    discordUsername: "", showDiscord: false,
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

  // tracks whether we've already hydrated state from the DB for the current session
  const [profileLoaded, setProfileLoaded] = useState(false);
  const isModalOpen = showCancelSubModal || showEditModal;

  // Reset profile state when the user logs out
  useEffect(() => {
    if (!session) {
      setSavedProfile({
        firstName: "", lastName: "", birthDay: "", birthMonth: "", birthYear: "",
        location: "", countryCode: "", phoneNumber: "", showPhone: false,
        instagramUsername: "", showInstagram: false,
        tiktokUsername: "", showTiktok: false,
        snapchatUsername: "", showSnapchat: false,
        discordUsername: "", showDiscord: false,
        profileImagePreview: null, answers: {}, selected: {}, skipped: {},
        subscriptionStatus: "free",
        freeSearchesRemaining: 3,
        idType: 1,
      });
      setProfileLoaded(false);
      setSubscriptionDetails({ loading: false, error: "", currentPeriodEnd: null });
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

  // Hydrate all profile state from DB once session + catalog are both ready
  useEffect(() => {
    if (!session?.user || !dbData || profileLoaded) return;

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
    };

    getUserProfile(session.user.id)
      .then((data) => {
        const { profile, keywordIds } = data;

        // Parse "YYYY-MM-DD" into individual day/month/year strings
        let loadedDay = "", loadedMonth = "", loadedYear = "";
        if (profile.dateOfBirth) {
          const parts = profile.dateOfBirth.split("-");
          loadedYear  = parts[0] || "";
          loadedMonth = String(parseInt(parts[1] || "0", 10));
          loadedDay   = String(parseInt(parts[2] || "0", 10));
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
        const newSkipped = data.skipped || {};

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
        setShowPhone(profile.showPhone);
        setInstagramUsername(profile.instagram);
        setShowInstagram(profile.showInstagram);
        setTiktokUsername(profile.tiktok);
        setShowTiktok(profile.showTiktok);
        setSnapchatUsername(profile.snapchat);
        setShowSnapchat(profile.showSnapchat);
        setDiscordUsername(profile.discord);
        setShowDiscord(profile.showDiscord);
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
          showPhone: profile.showPhone,
          instagramUsername: profile.instagram, showInstagram: profile.showInstagram,
          tiktokUsername: profile.tiktok, showTiktok: profile.showTiktok,
          snapchatUsername: profile.snapchat, showSnapchat: profile.showSnapchat,
          discordUsername: profile.discord, showDiscord: profile.showDiscord,
          profileImagePreview: profile.profileUrl,
          answers: newAnswers, selected: newSelected, skipped: newSkipped,
          subscriptionStatus: profile.subscriptionStatus || "free",
          freeSearchesRemaining: profile.freeSearchesRemaining ?? 3,
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
  }, [session, dbData, profileLoaded]);

  // Stage 2: compact state — 4 objects instead of ~100 individual hooks
  const [answers,  setAnswers]  = useState({});  // yes/no answers  keyed by question id
  const [selected, setSelected] = useState({});  // selected keywords keyed by selector id
  const [skipped,  setSkipped]  = useState({});  // skip flags        keyed by selector id
  const [searches, setSearches] = useState({});  // search terms      keyed by selector id
  const [debouncedSearches, setDebouncedSearches] = useState({});
  const [loadingSearchKeys, setLoadingSearchKeys] = useState({});
  const yesNoKeys = useMemo(() => ([
    "visualArt", "digitalArt", "listenMusic", "produceMusic", "playInstruments",
    "likePerforming", "likeWriting", "likeAnime", "likeGames", "likeMemes",
    "likeTech", "likeProgramming", "likeAI", "attendEducation",
    "goGym", "practiceSports", "likeOutdoor", "likeCars",
  ]), []);
  const directKeys = useMemo(() => ([
    "movies", "tvShows", "apps", "careers", "personality", "hobbies",
    "sexuality", "food", "places", "animals", "roleModels", "other",
  ]), []);

  const isProfileComplete = useMemo(() => {
    const hasRequiredProfileInfo =
      !!savedProfile.firstName?.trim() &&
      !!savedProfile.lastName?.trim() &&
      !!savedProfile.birthDay &&
      !!savedProfile.birthMonth &&
      !!savedProfile.birthYear &&
      !!savedProfile.location?.trim();

    const hasVisibleContact =
      (!!savedProfile.phoneNumber?.trim() && savedProfile.showPhone) ||
      (!!savedProfile.instagramUsername?.trim() && savedProfile.showInstagram) ||
      (!!savedProfile.tiktokUsername?.trim() && savedProfile.showTiktok) ||
      (!!savedProfile.snapchatUsername?.trim() && savedProfile.showSnapchat) ||
      (!!savedProfile.discordUsername?.trim() && savedProfile.showDiscord);

    const answeredYesNo = yesNoKeys.filter((key) => savedProfile.answers?.[key] != null).length;
    const completedDirect = directKeys.filter(
      (key) => (savedProfile.selected?.[key]?.length > 0) || savedProfile.skipped?.[key]
    ).length;
    const completedAllQuestions = answeredYesNo + completedDirect === yesNoKeys.length + directKeys.length;

    return hasRequiredProfileInfo && hasVisibleContact && completedAllQuestions;
  }, [savedProfile, yesNoKeys, directKeys]);

  const mustCompleteProfile =
    !!session &&
    profileLoaded &&
    routerLocation.pathname === "/console" &&
    !isProfileComplete;

  const setAnswer  = (key, val) => setAnswers(prev  => ({ ...prev, [key]: prev[key] === val ? null : val }));
  const toggleKw   = (key, name) => setSelected(prev => ({
    ...prev,
    [key]: (prev[key] || []).includes(name)
      ? (prev[key] || []).filter(k => k !== name)
      : [...(prev[key] || []), name],
  }));
  const toggleSkip = (key) => setSkipped(prev => ({ ...prev, [key]: !prev[key] }));
  const setSearch  = (key, val) => setSearches(prev => ({ ...prev, [key]: val }));

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
    if (answers.likeAI === "yes") autoSelect("ai", "AI");
  }, [answers.likeAI]);

  useEffect(() => {
    if (answers.goGym === "yes") autoSelect("fitness", "Gym");
  }, [answers.goGym]);

  useEffect(() => {
    if (answers.practiceSports === "yes") autoSelect("hobbies", "Sports");
  }, [answers.practiceSports]);

  useEffect(() => {
    const vehicleSel = selected.vehicles || [];
    if (vehicleSel.some(name => {
      const item = vehicleItems.find(i => i.name === name);
      return item && carItemIds.has(item.id);
    })) autoSelect("vehicles", "Cars");
    if (vehicleSel.some(name => {
      const item = vehicleItems.find(i => i.name === name);
      return item && motoItemIds.has(item.id);
    })) autoSelect("vehicles", "Bikes");
  }, [selected.vehicles, vehicleItems, carItemIds, motoItemIds]);

  const handleGoogleLogin = async (e) => {
    e.preventDefault();
    setGoogleLoading(true);
    setAuthError("");

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
    ).catch(() => {});
    await supabase.auth.signOut();
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();

    if (!session?.user) {
      window.location.href = "/login";
      return;
    }

    setCheckoutLoading(true);

    const successUrl = `${window.location.origin}${window.location.pathname}?subscribed=1`;
    const cancelUrl  = `${window.location.origin}${window.location.pathname}`;

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
    setBirthDay(savedProfile.birthDay);
    setBirthMonth(savedProfile.birthMonth);
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
    setShowEditModal(false);
    setEditStage(1);
    setValidated(false);
    setSearches({});
  }, [routerLocation.pathname]);

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
      navigate("/", { replace: true });
    }, 0);
  }, [routerLocation.pathname, routerLocation.search, navigate, session]);

  // Renders a keyword selector. Caps unselected items at 100 when no search is
  // active to keep performance reasonable; selected items always show.
  const renderKeywords = (key, items, canSkip) => {
    const term         = (debouncedSearches[key] || "").toLowerCase();
    const isLoadingKw  = !!loadingSearchKeys[key];
    const sel          = selected[key] || [];
    const isSkipped    = canSkip && !!skipped[key];
    const allFiltered  = items.filter(i => i.name.toLowerCase().includes(term));
    const filteredSel  = allFiltered.filter(i =>  sel.includes(i.name));
    const filteredUnsel= allFiltered.filter(i => !sel.includes(i.name));
    const unselToShow  = term ? filteredUnsel : filteredUnsel.slice(0, 100);
    const hasMore      = !term && filteredUnsel.length > 100;
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
                      <button key={i.id} type="button" className="btn btn-category modal-keyword-card" onClick={() => toggleKw(key, i.name)}>
                        <small className="d-block text-start opacity-75">{itemSubcategoryMap[i.id] || "Interest"}</small>
                        <div className="d-flex align-items-center gap-2"><span>{i.name}</span><i className="bi bi-dash-square"></i></div>
                      </button>
                    ))}
                    {unselToShow.map(i => (
                      <button key={i.id} type="button" className="btn btn-category-outline modal-keyword-card" onClick={() => toggleKw(key, i.name)}>
                        <small className="d-block text-start opacity-75">{itemSubcategoryMap[i.id] || "Interest"}</small>
                        <div className="d-flex align-items-center gap-2"><span>{i.name}</span><i className="bi bi-plus-square"></i></div>
                      </button>
                    ))}
                    {allFiltered.length === 0 && (
                      <span className="text-muted w-100 text-center">
                        No results found.{' '}
                        {key === 'other' && (
                          otherKeywordRequestStatus === 'done' ? (
                            <span className="text-success">Keyword requested!</span>
                          ) : otherKeywordRequestStatus === 'error' ? (
                            <span className="text-danger">Failed to request keyword.</span>
                          ) : (
                            <a
                              href="#"
                              style={{ textDecoration: 'underline', color: '#6D28D9' }}
                              onClick={async (e) => {
                                e.preventDefault();
                                if (otherKeywordRequestStatus === 'loading') return;
                                setOtherKeywordRequestStatus('loading');
                                try {
                                  await requestKeyword((debouncedSearches['other'] || '').trim());
                                  setOtherKeywordRequestStatus('done');
                                } catch {
                                  setOtherKeywordRequestStatus('error');
                                }
                              }}
                            >
                              {otherKeywordRequestStatus === 'loading' ? 'Requesting...' : 'Click me to request keyword'}
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
    if (!firstName.trim() || !lastName.trim() || firstNameTypeError || lastNameTypeError || !birthDay || !birthMonth || !birthYear || !location.trim() || !hasContact || countryCodeTypeError || phoneTypeError) return;
      // Auto-select matching countries/cities in question 26 (places)
      const locationParts = location.split(",").map(p => p.trim().toLowerCase());
      const locationMatches = [...countryItems, ...cityItems]
        .filter(item => locationParts.some(part => part === item.name.toLowerCase()))
        .map(item => item.name);
      if (locationMatches.length > 0) {
        setSelected(prev => {
          const existing = prev.places || [];
          const toAdd = locationMatches.filter(m => !existing.includes(m));
          return toAdd.length > 0 ? { ...prev, places: [...existing, ...toAdd] } : prev;
        });
      }
      setValidated(false);
      setEditStage(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

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
      firstName, lastName, birthDay, birthMonth, birthYear,
      location, countryCode, phoneNumber, showPhone,
      instagramUsername, showInstagram,
      tiktokUsername, showTiktok,
      snapchatUsername, showSnapchat,
      discordUsername, showDiscord,
      profileImagePreview: finalImageUrl ?? profileImagePreview,
      answers, selected, skipped,
      subscriptionStatus: savedProfile.subscriptionStatus,
      freeSearchesRemaining: savedProfile.freeSearchesRemaining,
      idType: savedProfile.idType,
    };
    setSavedProfile(profile);
    if (onProfileSave) onProfileSave(profile);
    closeEditModal({ force: true });

    // Persist to DB if logged in
    if (session?.user) {
      try {
        // Resolve keyword names -> IDs using the catalog
        const nameToId = {};
        (dbData?.categories ?? []).forEach(cat =>
          cat.subcategories.forEach(sub =>
            sub.items.forEach(item => { nameToId[item.name] = item.id; })
          )
        );
        const keywordIds = Object.values(selected)
          .flat()
          .map(name => nameToId[name])
          .filter(id => id != null);

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
            answers,
            skipped,
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
    + directKeys.filter(k => (selected[k]?.length > 0) || skipped[k]).length;
  const totalQuestions = yesNoKeys.length + directKeys.length;
  const hasContact = (phoneNumber.trim() && showPhone) ||
    (instagramUsername.trim() && showInstagram) ||
    (tiktokUsername.trim() && showTiktok) ||
    (snapchatUsername.trim() && showSnapchat) ||
    (discordUsername.trim() && showDiscord);

  return (
    <>
    <nav className="navbar navbar-expand-lg bg-body-tertiary">
      <div className="container-fluid">
        <Link className="navbar-brand" to="/">
          <img src={logo} alt="Logo" className="logo"/><span className="navbar-brand-text">LetsFindPeople</span>
        </Link>

        <div className="navbar-collapse" id="navbarNavDropdown">
          <ul className="navbar-nav ms-auto align-items-center">

            {/* Admin Button - show when logged in and user is admin */}
            {session && savedProfile.idType === 2 && routerLocation.pathname !== "/admin" && (
            <Link className="nav-link" to="/admin">
              Admin
            </Link>
            )}

            {/* Console Button - show when logged in */}
            {session && routerLocation.pathname !== "/console" && (
            <Link className="nav-link" to="/console">
              Console
            </Link>
            )}

            {/* Pricing Dropdown - only show when logged in and subscription is not active or canceling */}
            {session && !["active", "canceling"].includes(savedProfile.subscriptionStatus) && (
            <div className="dropdown" style={{ position: "relative" }}>
              <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                Pricing
              </a>
              <div className="dropdown-menu dropdown-menu-end p-4 navbar-dropdown-panel navbar-pricing-dropdown">
                <div className="row align-items-center">
                  <h5 className="title mb-2">Free Trial</h5>
                  <p className="text mb-0">Access to limited searches and all keywords.</p>
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
                  <h5 className="title mb-2">Basic Plan</h5>
                  <p className="text mb-0">Access to unlimited searches and all keywords.</p>
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
                      : "Subscribe for €2,99/month"}
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
                <li><a className="dropdown-item" href="#" onClick={(e) => { e.preventDefault(); setShowCancelSubModal(true); }}>Settings</a></li>
                <li><a className="dropdown-item" href="#" onClick={handleLogout}>Logout</a></li>
              </ul>
            </div>
            )}

            {/* Iniciar Sessão Dropdown */}
            {!session && (
            <div className="dropdown">
              <a
                className="nav-link dropdown-toggle"
                href="#"
                role="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                ref={loginDropdownToggleRef}
              >
                Sign Up | Login
              </a>
              <div className="dropdown-menu dropdown-menu-end p-4 navbar-dropdown-panel navbar-login-dropdown">
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
                      ? "Basic Plan"
                      : savedProfile.subscriptionStatus === "canceling"
                      ? "Basic Plan (canceling)"
                      : "Free Trial"}
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
                    <label className="form-label d-block">Profile Picture <span className="text-muted fw-normal" style={{fontSize:"0.85em"}}>(Optional)</span></label>
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

                  {/* First Name & Last Name Row */}
                  <div className="row">
                    <div className="col-md-6 mb-3">
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
                    <div className="col-md-6 mb-3">
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
                        {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
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
                      <label htmlFor="phoneNumber" className="form-label">Phone Number <span className="text-muted fw-normal" style={{fontSize:"0.85em"}}>(Optional)</span></label>
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
                      <label htmlFor="instagramUsername" className="form-label">Instagram <span className="text-muted fw-normal" style={{fontSize:"0.85em"}}>(Optional)</span></label>
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
                      <label htmlFor="tiktokUsername" className="form-label">TikTok <span className="text-muted fw-normal" style={{fontSize:"0.85em"}}>(Optional)</span></label>
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
                      <label htmlFor="snapchatUsername" className="form-label">Snapchat <span className="text-muted fw-normal" style={{fontSize:"0.85em"}}>(Optional)</span></label>
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
                      <label htmlFor="discordUsername" className="form-label">Discord <span className="text-muted fw-normal" style={{fontSize:"0.85em"}}>(Optional)</span></label>
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
                    <div className="text-danger" style={{ fontSize: "0.875em", marginTop: "0.25rem" }}>Please add and show at least one contact (phone number or username).</div>
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
                    <p className="fw-semibold mb-2">1- Do you make visual art?</p>
                    {renderYesNo("visualArt")}
                    {answers.visualArt === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any interests you have in visual art.</p>
                        {renderKeywords("visualArt", visualArtItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q2 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">2- Do you make digital art?</p>
                    {renderYesNo("digitalArt")}
                    {answers.digitalArt === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any interests you have in digital art.</p>
                        {renderKeywords("digitalArt", digitalArtItems, false)}
                        <p className="text-muted mt-3 mb-2" style={{ fontSize: 14 }}>Select any design software you use.</p>
                        {renderKeywords("designSoft", designSoftItems, true)}
                      </>
                    )}
                  </div>

                  {/* Q3 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">3- Do you listen to music?</p>
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

                  {/* Q4 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">4- Do you produce music?</p>
                    {renderYesNo("produceMusic")}
                    {answers.produceMusic === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any music software you use.</p>
                        {renderKeywords("musicSoft", musicSoftItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q5 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">5- Do you play instruments?</p>
                    {renderYesNo("playInstruments")}
                    {answers.playInstruments === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select the instruments you play.</p>
                        {renderKeywords("instruments", instrumentItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q6 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">6- Do you like performing or watching shows? (singing, dance, etc.)</p>
                    {renderYesNo("likePerforming")}
                    {answers.likePerforming === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select what you perform or the type of shows you like.</p>
                        {renderKeywords("performing", performItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q7 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">7- Do you like to write? (poetry, journalism, etc.)</p>
                    {renderYesNo("likeWriting")}
                    {answers.likeWriting === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select what you write or the types of works you like.</p>
                        {renderKeywords("writing", writingItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q8 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">8- Select any movies or movie characters you like.</p>
                    {renderKeywords("movies", movieItems, true)}
                  </div>

                  {/* Q9 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">9- Select any TV shows or TV show characters you like.</p>
                    {renderKeywords("tvShows", tvShowItems, true)}
                  </div>

                  {/* Q10 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">10- Do you like anime?</p>
                    {renderYesNo("likeAnime")}
                    {answers.likeAnime === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any anime or characters you like.</p>
                        {renderKeywords("anime", animeItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q11 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">11- Do you like video games?</p>
                    {renderYesNo("likeGames")}
                    {answers.likeGames === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any video games you have played or like.</p>
                        {renderKeywords("games", gamingItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q12 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">12- Do you like memes?</p>
                    {renderYesNo("likeMemes")}
                    {answers.likeMemes === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any memes you like.</p>
                        {renderKeywords("memes", memeItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q13 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">13- Select any apps or social media you like.</p>
                    {renderKeywords("apps", appItems, true)}
                  </div>

                  {/* Q14 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">14- Do you like technology?</p>
                    {renderYesNo("likeTech")}
                    {answers.likeTech === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any phones, laptops, tech brands, or other devices you like.</p>
                        {renderKeywords("devices", deviceItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q15 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">15- Do you like programming?</p>
                    {renderYesNo("likeProgramming")}
                    {answers.likeProgramming === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any programming languages or game development engines you like.</p>
                        {renderKeywords("progLang", progLangItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q16 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">16- Do you like AI?</p>
                    {renderYesNo("likeAI")}
                    {answers.likeAI === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any chatbots or AI models you like.</p>
                        {renderKeywords("ai", aiItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q17 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">17- Are you currently in school or university?</p>
                    {renderYesNo("attendEducation")}
                    {answers.attendEducation === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select your favourite subjects.</p>
                        {renderKeywords("subjects", subjectItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q18 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">18- Select your current or dream career.</p>
                    {renderKeywords("careers", careerItems, true)}
                  </div>

                  {/* Q19 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">19- Select your personality.</p>
                    {renderKeywords("personality", personalityItems, true)}
                  </div>

                  {/* Q20 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">20- Select any hobbies you have.</p>
                    {renderKeywords("hobbies", hobbyItems, true)}
                  </div>

                  {/* Q21 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">21- Select your sexuality.</p>
                    {renderKeywords("sexuality", sexualityItems, true)}
                  </div>

                  {/* Q22 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">22- Do you go to the gym?</p>
                    {renderYesNo("goGym")}
                    {answers.goGym === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any keywords related to your fitness.</p>
                        {renderKeywords("fitness", fitnessItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q23 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">23- Do you practice sports?</p>
                    {renderYesNo("practiceSports")}
                    {answers.practiceSports === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select the sports you practice.</p>
                        {renderKeywords("sports", sportsItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q24 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">24- Do you like outdoor physical activities like hiking or camping?</p>
                    {renderYesNo("likeOutdoor")}
                    {answers.likeOutdoor === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any outdoor physical activities you like.</p>
                        {renderKeywords("outdoor", outdoorItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q25 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">25- Select any foods, fast food chains, drinks or restaurants you like.</p>
                    {renderKeywords("food", foodItems, true)}
                  </div>

                  {/* Q26 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">26- Select any countries, cities, or places you're interested in, have been to, or live in.</p>
                    {renderKeywords("places", placeItems, true)}
                  </div>

                  {/* Q27 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">27- Select any animals or plants you like.</p>
                    {renderKeywords("animals", animalItems, true)}
                  </div>

                  {/* Q28 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">28- Do you like cars or motorcycles?</p>
                    {renderYesNo("likeCars")}
                    {answers.likeCars === "yes" && (
                      <>
                        <p className="text-muted mb-2" style={{ fontSize: 14 }}>Select any cars, motorcycles, or other vehicles you like.</p>
                        {renderKeywords("vehicles", vehicleItems, false)}
                      </>
                    )}
                  </div>

                  {/* Q29 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">29- Select any people or role models you follow.</p>
                    {renderKeywords("roleModels", roleModelItems, true)}
                  </div>

                  {/* Q30 */}
                  <div className="mb-4">
                    <p className="fw-semibold mb-2">30- Select any other interests you have.</p>
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
