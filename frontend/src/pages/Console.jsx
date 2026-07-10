import { useState, useMemo, useEffect, useDeferredValue, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import defaultProfile from "../assets/default-profile.jpg";
import { useDbData } from "../context/DbDataContext";
import { useAuth } from "../context/AuthContext";
import {
  searchUsers,
  consumeSearchAllowance,
  requestKeyword,
  getUserCount,
  getPublicUserById,
  userMatchesSearchFilters,
} from "../lib/catalogService";
import { recordProfileView, recordSearchAnalytics } from "../lib/analyticsService";
import {
  getLatestEnabledDrawEventNotification,
  removeSiteNotificationSubscription,
  subscribeToSiteNotifications,
} from "../lib/notificationService";

const MAX_SEARCH_KEYWORDS = 12;
const DESKTOP_KEYWORD_RESULT_LIMIT = 100;
const MOBILE_KEYWORD_RESULT_LIMIT = 25;
const MIN_SEARCH_AGE = 16;
const MAX_SEARCH_AGE = 64;
const WORLD_COUNTRY_FILTER = "World";
const GENDER_KEYWORDS = ["Male", "Female", "Other"];
const SEX_FILTER_OPTIONS = [
  { value: "Male", icon: "bi-gender-male" },
  { value: "Female", icon: "bi-gender-female" },
];
const AGE_GROUP_OPTIONS = [
  { value: "all", label: "👥 All Ages", min: MIN_SEARCH_AGE, max: MAX_SEARCH_AGE },
  { value: "16-18", label: "🧒 16-18", min: 16, max: 18 },
  { value: "18-24", label: "🧑 18-24", min: 18, max: 24 },
  { value: "24-36", label: "👨 24-36", min: 24, max: 36 },
  { value: "36+", label: "👴 36+", min: 36, max: MAX_SEARCH_AGE },
];
const ISO_COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");
const COUNTRY_CODE_ALIASES = {
  bolivia: "BO",
  "bosnia and herzegovina": "BA",
  "brunei darussalam": "BN",
  "cape verde": "CV",
  "cote d'ivoire": "CI",
  "cote divoire": "CI",
  czechia: "CZ",
  "democratic republic of the congo": "CD",
  "east timor": "TL",
  iran: "IR",
  laos: "LA",
  macau: "MO",
  micronesia: "FM",
  moldova: "MD",
  palestine: "PS",
  "republic of congo": "CG",
  russia: "RU",
  "saint barthelemy": "BL",
  "saint martin": "MF",
  "south korea": "KR",
  "syria": "SY",
  taiwan: "TW",
  tanzania: "TZ",
  turkey: "TR",
  uk: "GB",
  "united kingdom": "GB",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  venezuela: "VE",
  vietnam: "VN",
};
const YES_NO_KEYS = [
  "visualArt",
  "listenMusic",
  "produceMusic",
  "likeAnime",
  "likeGames",
  "likeProgramming",
  "attendEducation",
  "goGym",
];
const DIRECT_KEYS = [
  "movies",
  "tvShows",
  "personality",
  "hobbies",
  "roleModels",
  "other",
];

function countMatchingKeywords(keywordIds, selectedKeywordIds) {
  const keywords = new Set((keywordIds || []).map(Number));
  return selectedKeywordIds.reduce(
    (count, id) => count + (keywords.has(Number(id)) ? 1 : 0),
    0
  );
}

const PRICING_DROPDOWN_EVENT = "lfp:open-pricing";

const getAge = (birthday) => {
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

function normalizeCountryName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const countryCodeByName = (() => {
  const map = new Map();
  let regionNames = null;

  try {
    regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    regionNames = null;
  }

  if (regionNames) {
    ISO_COUNTRY_CODES.forEach((code) => {
      map.set(normalizeCountryName(regionNames.of(code)), code);
    });
  }

  Object.entries(COUNTRY_CODE_ALIASES).forEach(([name, code]) => {
    map.set(normalizeCountryName(name), code);
  });

  return map;
})();

function countryCodeToFlagEmoji(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function getCountryFlagEmoji(countryName) {
  const code = countryCodeByName.get(normalizeCountryName(countryName));
  return code ? countryCodeToFlagEmoji(code) : "🏳️";
}

function makeCountryOption(name, item) {
  return {
    id: item?.id ?? null,
    value: name,
    label: name,
    flag: name === WORLD_COUNTRY_FILTER ? "🌍" : getCountryFlagEmoji(name),
  };
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

function formatResetTime(resetAt) {
  return new Date(resetAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function openPricingDropdown() {
  window.dispatchEvent(new CustomEvent(PRICING_DROPDOWN_EVENT));
}

export default function Console({ currentUser }) {
  const { dbData, isLoading: catalogLoading } = useDbData();
  const { session, isLoading: authLoading, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const focusedUserId = useMemo(
    () => new URLSearchParams(location.search).get("user"),
    [location.search]
  );

  // State Management
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [selectedSexFilters, setSelectedSexFilters] = useState(() =>
    SEX_FILTER_OPTIONS.map((option) => option.value)
  );
  const [selectedCountryFilter, setSelectedCountryFilter] = useState(WORLD_COUNTRY_FILTER);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("all");
  const [ageRange, setAgeRange] = useState({ min: MIN_SEARCH_AGE, max: MAX_SEARCH_AGE });
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState(null); // null = not searched yet
  const [isSearching, setIsSearching] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [needsKeyword, setNeedsKeyword] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchedKeywords, setSearchedKeywords] = useState([]);
  const [keywordRequestStatus, setKeywordRequestStatus] = useState(null); // null | 'loading' | 'done' | 'error'
  const [userCount, setUserCount] = useState(null);
  const peopleContainerRef = useRef(null);
  const keywordScrollAreaRef = useRef(null);
  const previousKeywordSearchTermRef = useRef("");
  const pendingKeywordAutoScrollRef = useRef(false);
  const firstUnselectedKeywordRef = useRef(null);
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 576px)").matches : false
  );
  const [freeSearchesRemaining, setFreeSearchesRemaining] = useState(
    currentUser?.freeSearchesRemaining ?? 3
  );
  const [freeSearchesResetAt, setFreeSearchesResetAt] = useState(
    currentUser?.freeSearchesResetAt ?? null
  );
  const [_latestDrawEventNotification, setLatestDrawEventNotification] = useState(null);

  const hasUnlimitedSearches =
    isAdmin ||
    currentUser?.subscriptionStatus === "active" ||
    currentUser?.subscriptionStatus === "canceling";
  const hasFreeSearchesRemaining = freeSearchesRemaining > 0;
  const isLoggedIn = !!session?.user;
  const shouldOfferDrawEvent =
    isLoggedIn &&
    !isAdmin &&
    !hasUnlimitedSearches &&
    freeSearchesRemaining <= 0;
  const countryItems = useMemo(
    () => dbData?.categories?.[7]?.subcategories?.[0]?.items ?? [],
    [dbData]
  );
  const countryOptions = useMemo(() => {
    const userCountryNames = new Set(getMatchingCountryNames(currentUser?.location, countryItems));
    const countries = [...countryItems]
      .sort((a, b) => a.name.localeCompare(b.name));
    const userCountries = countries.filter((item) => userCountryNames.has(item.name));
    const otherCountries = countries.filter((item) => !userCountryNames.has(item.name));

    return [
      makeCountryOption(WORLD_COUNTRY_FILTER),
      ...userCountries.map((item) => makeCountryOption(item.name, item)),
      ...otherCountries.map((item) => makeCountryOption(item.name, item)),
    ];
  }, [countryItems, currentUser?.location]);
  const currentUserGender = getSelectedGender(currentUser?.selected);
  const currentUserCountryNames = useMemo(
    () => getMatchingCountryNames(currentUser?.location, countryItems),
    [currentUser?.location, countryItems]
  );
  const isProfileComplete = useMemo(() => {
    if (!currentUser) return false;

    const hasRequiredProfileInfo =
      !!currentUser.firstName?.trim() &&
      !!currentUser.lastName?.trim() &&
      !!currentUser.birthDay &&
      !!currentUser.birthMonth &&
      !!currentUser.birthYear &&
      !!currentUser.location?.trim();
    const hasRequiredGender = !!currentUserGender;
    const hasVisibleContact =
      (!!currentUser.phoneNumber?.trim() && currentUser.showPhone) ||
      (!!currentUser.instagramUsername?.trim() && currentUser.showInstagram) ||
      (!!currentUser.tiktokUsername?.trim() && currentUser.showTiktok) ||
      (!!currentUser.snapchatUsername?.trim() && currentUser.showSnapchat) ||
      (!!currentUser.discordUsername?.trim() && currentUser.showDiscord);
    const answeredYesNo = YES_NO_KEYS.filter((key) => currentUser.answers?.[key] != null).length;
    const completedDirect = DIRECT_KEYS.filter(
      (key) => isDirectQuestionComplete(
        currentUser.selected,
        currentUser.skipped,
        key,
        currentUserGender,
        currentUserCountryNames
      )
    ).length;
    const completedAllQuestions = answeredYesNo + completedDirect === YES_NO_KEYS.length + DIRECT_KEYS.length;

    return hasRequiredProfileInfo && hasRequiredGender && hasVisibleContact && completedAllQuestions;
  }, [currentUser, currentUserGender, currentUserCountryNames]);
  const searchSetupMessage = !isLoggedIn
    ? "*You have to login before searching"
    : !isProfileComplete
      ? "*You have to set up your profile before searching"
      : "";
  const showSearchInfo =
    !isAdmin &&
    (!!searchSetupMessage || !hasUnlimitedSearches || userCount >= 10000);
  const isSearchBlocked = !isLoggedIn || !isProfileComplete;
  const hasTooManyKeywords = selectedKeywords.length > MAX_SEARCH_KEYWORDS;
  const isSearchDisabled =
    isSearchBlocked ||
    isSearching ||
    catalogLoading ||
    hasTooManyKeywords ||
    (!hasUnlimitedSearches && !hasFreeSearchesRemaining);
  const keywordResultLimit = isMobileView
    ? MOBILE_KEYWORD_RESULT_LIMIT
    : DESKTOP_KEYWORD_RESULT_LIMIT;

  useEffect(() => {
    if (!focusedUserId) return undefined;
    if (authLoading) return undefined;

    const userId = Number(focusedUserId);
    if (!Number.isInteger(userId) || userId <= 0) {
      navigate("/", { replace: true });
      return undefined;
    }

    if (!session?.user) {
      setSearchError("You have to login before viewing this user.");
      setSearchResults([]);
      navigate("/", { replace: true });
      return undefined;
    }

    let isMounted = true;
    setIsSearching(true);
    setSearchResults(null);
    setSearchError(null);
    setNeedsKeyword(false);
    setSearchedKeywords([]);

    getPublicUserById(userId)
      .then((person) => {
        if (!isMounted) return;
        setSearchResults(person ? [person] : []);
        if (person) {
          recordProfileView(userId).catch((err) => {
            console.warn("Failed to record profile view:", err.message);
          });
        }
        navigate("/", { replace: true });
      })
      .catch((err) => {
        if (!isMounted) return;
        setSearchError(err.message || "Failed to load user.");
        setSearchResults([]);
        navigate("/", { replace: true });
      })
      .finally(() => {
        if (isMounted) setIsSearching(false);
      });

    return () => {
      isMounted = false;
    };
  }, [authLoading, focusedUserId, navigate, session?.user]);

  useEffect(() => {
    if (!focusedUserId || isSearching || !searchResults?.length) return;

    peopleContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusedUserId, isSearching, searchResults]);

  useEffect(() => {
    setFreeSearchesRemaining(currentUser?.freeSearchesRemaining ?? 3);
    setFreeSearchesResetAt(currentUser?.freeSearchesResetAt ?? null);
  }, [currentUser?.freeSearchesRemaining, currentUser?.freeSearchesResetAt]);

  // When searches are exhausted but resetAt is unknown, call the allowance
  // function to both set the reset timestamp in the DB and fetch it back.
  useEffect(() => {
    if (!isLoggedIn || hasUnlimitedSearches || freeSearchesRemaining > 0 || freeSearchesResetAt) return;
    consumeSearchAllowance()
      .then((allowance) => { if (allowance.resetAt) setFreeSearchesResetAt(allowance.resetAt); })
      .catch(() => {});
  }, [isLoggedIn, hasUnlimitedSearches, freeSearchesRemaining, freeSearchesResetAt]);

  useEffect(() => {
    if (!isLoggedIn || hasUnlimitedSearches || freeSearchesRemaining > 0 || !freeSearchesResetAt) return undefined;

    const resetTime = new Date(freeSearchesResetAt).getTime();
    if (!Number.isFinite(resetTime)) return undefined;

    const refreshFreeSearches = () => {
      setFreeSearchesRemaining(3);
      setFreeSearchesResetAt(null);
    };

    const msUntilReset = resetTime - Date.now();
    if (msUntilReset <= 0) {
      refreshFreeSearches();
      return undefined;
    }

    const timeoutId = window.setTimeout(refreshFreeSearches, msUntilReset);
    return () => window.clearTimeout(timeoutId);
  }, [freeSearchesRemaining, freeSearchesResetAt, hasUnlimitedSearches, isLoggedIn]);

  useEffect(() => {
    if (!shouldOfferDrawEvent) {
      setLatestDrawEventNotification(null);
      return undefined;
    }

    let isMounted = true;
    const loadLatestDrawEvent = () => {
      getLatestEnabledDrawEventNotification()
        .then((notification) => {
          if (isMounted) setLatestDrawEventNotification(notification);
        })
        .catch((err) => {
          if (isMounted) {
            console.warn("Failed to load draw event notification:", err.message);
            setLatestDrawEventNotification(null);
          }
        });
    };

    loadLatestDrawEvent();
    const channel = subscribeToSiteNotifications(loadLatestDrawEvent);

    return () => {
      isMounted = false;
      removeSiteNotificationSubscription(channel);
    };
  }, [shouldOfferDrawEvent]);

  useEffect(() => {
    let isMounted = true;

    getUserCount()
      .then((count) => {
        if (isMounted) setUserCount(count);
      })
      .catch((err) => {
        console.warn("Failed to load user count:", err.message);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 576px)");
    const handleViewportChange = (event) => setIsMobileView(event.matches);

    setIsMobileView(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleViewportChange);

    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  // Build lookup map: id -> { name, subcategory }
  const keywordMap = useMemo(() => {
    const map = {};
    (dbData?.categories ?? []).forEach((cat) => {
      cat.subcategories.forEach((sub) => {
        sub.items.forEach((item) => {
          map[item.id] = { name: item.name, subcategory: sub.name };
        });
      });
    });
    return map;
  }, [dbData]);

  // Build reverse map: name -> id (to convert Navbar's name-based selections to IDs)
  const nameToIdMap = useMemo(() => {
    const map = {};
    (dbData?.categories ?? []).forEach((cat) => {
      cat.subcategories.forEach((sub) => {
        sub.items.forEach((item) => {
          map[item.name] = item.id;
        });
      });
    });
    return map;
  }, [dbData]);

  const activeSearchFilters = useMemo(() => {
    const selectedCountry = countryOptions.find((option) => option.value === selectedCountryFilter);
    const sexKeywordIds = selectedSexFilters
      .map((sex) => nameToIdMap[sex])
      .filter((id) => id != null);

    return {
      sexes: selectedSexFilters,
      sexKeywordIds,
      countryName: selectedCountryFilter === WORLD_COUNTRY_FILTER ? "" : selectedCountryFilter,
      countryKeywordId: selectedCountry?.id ?? nameToIdMap[selectedCountryFilter] ?? null,
      minAge: ageRange.min,
      maxAge: ageRange.max,
    };
  }, [ageRange.max, ageRange.min, countryOptions, nameToIdMap, selectedCountryFilter, selectedSexFilters]);

  // Convert savedProfile from Navbar into a user object compatible with the list
  const currentUserFormatted = useMemo(() => {
    if (!currentUser?.firstName) return null;
    const { birthDay, birthMonth, birthYear } = currentUser;
    const birth = new Date(Number(birthYear), Number(birthMonth) - 1, Number(birthDay));
    const age = Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    // Prefer persisted IDs because keyword labels can repeat across selectors.
    const keywordIds = Array.isArray(currentUser.keywordIds)
      ? currentUser.keywordIds
      : [...new Set(Object.values(currentUser.selected || {})
        .flat()
        .map((name) => nameToIdMap[name])
        .filter((id) => id != null))];
    return {
      id: "current",
      name: `${currentUser.firstName} ${currentUser.lastName}`,
      isCurrentUser: true,
      age: isNaN(age) ? null : age,
      location: currentUser.location,
      contacts: {
        phone:     { value: currentUser.countryCode && currentUser.phoneNumber ? `${currentUser.countryCode} ${currentUser.phoneNumber}` : (currentUser.phoneNumber || ""), show: currentUser.showPhone },
        instagram: { value: currentUser.instagramUsername, show: currentUser.showInstagram },
        tiktok:    { value: currentUser.tiktokUsername,    show: currentUser.showTiktok },
        snapchat:  { value: currentUser.snapchatUsername,  show: currentUser.showSnapchat },
        discord:   { value: currentUser.discordUsername,   show: currentUser.showDiscord },
      },
      profilePicture: currentUser.profileImagePreview,
      keywordIds,
    };
  }, [currentUser, nameToIdMap]);

  // Run search: call backend with selected keyword IDs, then rank by overlap
  const runSearch = async () => {
    if (focusedUserId) {
      navigate("/", { replace: true });
    }

    const hadSearch = searchTerm.trim().length > 0;
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setNeedsKeyword(false);
    setSearchError(null);

    if (!isLoggedIn) {
      setSearchError("You have to login before searching");
      return;
    }

    if (!isProfileComplete) {
      setSearchError("You have to set up your profile before searching");
      return;
    }

    if (selectedKeywords.length === 0) {
      setNeedsKeyword(true);
      return;
    }

    if (selectedKeywords.length > MAX_SEARCH_KEYWORDS) {
      setSearchError(`Select up to ${MAX_SEARCH_KEYWORDS} keywords to search.`);
      return;
    }

    if (!hasUnlimitedSearches && !hasFreeSearchesRemaining) {
      setSearchError("You have no free searches remaining.");
      return;
    }

    if (hadSearch) setIsResetting(true);
    setIsSearching(true);
    setSearchResults(null);
    setSearchedKeywords([...selectedKeywords]);

    try {
      if (!hasUnlimitedSearches) {
        const allowance = await consumeSearchAllowance();
        setFreeSearchesRemaining(allowance.remaining);
        if (allowance.resetAt) setFreeSearchesResetAt(allowance.resetAt);

        if (!allowance.allowed) {
          setSearchError(allowance.reason || "You have no free searches remaining.");
          setSearchResults([]);
          return;
        }
      }

      const { users } = await searchUsers(selectedKeywords, activeSearchFilters);
      recordSearchAnalytics(
        selectedKeywords,
        users.map((user) => user.id)
      ).catch((err) => {
        console.warn("Failed to record search analytics:", err.message);
      });
      // Filter out the current user from backend results to avoid duplicate
      const filtered = session?.user?.id
        ? users.filter(u => u.supabaseUid !== session.user.id)
        : users;
      const results = filtered.map((user) => ({
        ...user,
        matchCount: user.matchCount || countMatchingKeywords(user.keywordIds, selectedKeywords),
      }));
      const currentUserMatchCount = currentUserFormatted
        ? countMatchingKeywords(currentUserFormatted.keywordIds, selectedKeywords)
        : 0;
      if (
        currentUserFormatted &&
        currentUserMatchCount > 0 &&
        userMatchesSearchFilters(currentUserFormatted, activeSearchFilters)
      ) {
        results.push({ ...currentUserFormatted, matchCount: currentUserMatchCount });
      }
      setSearchResults(results.sort((a, b) => (b.matchCount || 0) - (a.matchCount || 0)));
    } catch (err) {
      setSearchError(err.message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const isFirstSearchRender = useRef(true);

  // Debounce search term - only search after user stops typing
  useEffect(() => {
    if (isFirstSearchRender.current) {
      isFirstSearchRender.current = false;
      return;
    }
    setIsLoading(true);
    setKeywordRequestStatus(null);
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setIsLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Get all keywords from database
  const allKeywords = useMemo(() => {
    const items = [];
    (dbData?.categories ?? []).forEach((category) => {
      category.subcategories.forEach((subcategory) => {
        subcategory.items.forEach((item) => {
          items.push({ id: item.id, name: item.name, subcategory: subcategory.name });
        });
      });
    });
    return items.sort((a, b) => (
      a.name.localeCompare(b.name) ||
      a.subcategory.localeCompare(b.subcategory) ||
      a.id - b.id
    ));
  }, [dbData]);

  // Filter keywords based on debounced search term
  const filteredKeywords = useMemo(() => {
    if (!debouncedSearchTerm.trim()) return allKeywords;
    const selectedKeywordIds = new Set(selectedKeywords);
    const normalizedSearchTerm = debouncedSearchTerm.toLowerCase();

    return allKeywords.filter((item) =>
      selectedKeywordIds.has(item.id) ||
      item.name.toLowerCase().includes(normalizedSearchTerm)
    );
  }, [debouncedSearchTerm, allKeywords, selectedKeywords]);

  const deferredFilteredKeywords = useDeferredValue(filteredKeywords);

  useEffect(() => {
    const trimmedSearchTerm = debouncedSearchTerm.trim();
    if (previousKeywordSearchTermRef.current === trimmedSearchTerm) return;

    previousKeywordSearchTermRef.current = trimmedSearchTerm;
    pendingKeywordAutoScrollRef.current = !!trimmedSearchTerm;
  }, [debouncedSearchTerm]);

  useEffect(() => {
    if (!pendingKeywordAutoScrollRef.current) return undefined;
    if (deferredFilteredKeywords !== filteredKeywords) return undefined;

    const scrollArea = keywordScrollAreaRef.current;
    const firstUnselectedKeyword = firstUnselectedKeywordRef.current;
    if (!scrollArea || !firstUnselectedKeyword) {
      pendingKeywordAutoScrollRef.current = false;
      return undefined;
    }

    pendingKeywordAutoScrollRef.current = false;

    const frameId = window.requestAnimationFrame(() => {
      scrollArea.scrollTo({
        top: Math.max(0, firstUnselectedKeyword.offsetTop - scrollArea.offsetTop),
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [deferredFilteredKeywords, filteredKeywords]);

  // Keyword Selection
  const toggleKeyword = (id) => {
    setSelectedKeywords((prev) =>
      prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]
    );
  };

  const toggleSexFilter = (sex) => {
    setSelectedSexFilters((prev) =>
      prev.includes(sex)
        ? prev.filter((item) => item !== sex)
        : [...prev, sex]
    );
  };

  const handleAgeGroupChange = (value) => {
    const option = AGE_GROUP_OPTIONS.find((item) => item.value === value) || AGE_GROUP_OPTIONS[0];

    setSelectedAgeGroup(option.value);
    setAgeRange({ min: option.min, max: option.max });
  };

  // Clear isResetting only once deferredFilteredKeywords has caught up to allKeywords
  useEffect(() => {
    if (isResetting && deferredFilteredKeywords === allKeywords) {
      setIsResetting(false);
    }
  }, [isResetting, deferredFilteredKeywords, allKeywords]);

  const selectedCountryOption =
    countryOptions.find((option) => option.value === selectedCountryFilter) ||
    countryOptions[0];

  // Render UI
  return (
    <div className="container py-4 pt-5">
      {/* Search Bar */}
      <div className="input-group mb-4">
        <span className="input-group-text bg-white border-end-0 rounded-start-pill">
          <i className="bi bi-search"></i>
        </span>
        <input
          type="text"
          className="form-control border-start-0 rounded-end-pill"
          placeholder={isMobileView ? "Search keywords" : "Search keywords..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Keywords Counter */}
      <div className="console-keyword-meta d-flex justify-content-between align-items-start gap-3 mb-2">
        <small className="console-selected-count text-muted">
          ({selectedKeywords.length} selected)
        </small>
        <small className="console-results-count text-muted">
          {deferredFilteredKeywords.length > keywordResultLimit ? (
            <>
              Showing {keywordResultLimit} out of {deferredFilteredKeywords.length.toLocaleString()} keywords.
              <span className="console-results-hint"> Use the search bar to find more.</span>
            </>
          ) : (
            `Showing ${deferredFilteredKeywords.length.toLocaleString()} results`
          )}
        </small>
      </div>

      <div className="console-search-grid">
        {/* Keywords Container */}
        <div className="border rounded-4 p-3 unselected-keywords-container">
          <div className="modal-scroll-area d-flex flex-wrap gap-2" ref={keywordScrollAreaRef}>
            {catalogLoading || isLoading ? (
              <div className="d-flex justify-content-center align-items-center w-100" style={{ minHeight: "200px" }}>
                <div className="spinner-border spinner-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : deferredFilteredKeywords.length > 0 ? (
              <>
                {(() => {
                  const selected = deferredFilteredKeywords.filter((item) => selectedKeywords.includes(item.id));
                  const unselected = deferredFilteredKeywords.filter((item) => !selectedKeywords.includes(item.id));
                  const visibleUnselected = unselected.slice(0, Math.max(0, keywordResultLimit - selected.length));
                  return (
                    <>
                      {selected.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="btn btn-category modal-keyword-card"
                          onClick={() => toggleKeyword(item.id)}
                        >
                          <small className="d-block text-start opacity-75">{item.subcategory}</small>
                          <div className="d-flex align-items-center gap-2">
                            <span>{item.name}</span>
                            <i className="bi bi-dash-square"></i>
                          </div>
                        </button>
                      ))}
                      {visibleUnselected.map((item, index) => (
                        <button
                          key={item.id}
                          ref={index === 0 ? firstUnselectedKeywordRef : null}
                          type="button"
                          className="btn btn-category-outline modal-keyword-card"
                          onClick={() => toggleKeyword(item.id)}
                        >
                          <small className="d-block text-start opacity-75">{item.subcategory}</small>
                          <div className="d-flex align-items-center gap-2">
                            <span>{item.name}</span>
                            <i className="bi bi-plus-square"></i>
                          </div>
                        </button>
                      ))}
                    </>
                  );
                })()}
              </>
            ) : (
              <span className="text-muted w-100 text-center">
                No results found.{' '}
                {keywordRequestStatus === 'done' ? (
                  <span className="text-success">Keyword requested!</span>
                ) : keywordRequestStatus === 'error' ? (
                  <span className="text-danger">Failed to request keyword.</span>
                ) : (
                  <a
                    href="#"
                    style={{ textDecoration: 'underline', color: '#6D28D9' }}
                    onClick={async (e) => {
                      e.preventDefault();
                      if (keywordRequestStatus === 'loading') return;
                      setKeywordRequestStatus('loading');
                      try {
                        await requestKeyword(debouncedSearchTerm.trim());
                        setKeywordRequestStatus('done');
                      } catch {
                        setKeywordRequestStatus('error');
                      }
                    }}
                  >
                    {keywordRequestStatus === 'loading' ? 'Requesting...' : 'Click me to request keyword'}
                  </a>
                )}
              </span>
            )}
          </div>
        </div>

        <aside className="console-filter-panel" aria-label="Search filters">
          <div className="console-sex-filter" aria-label="Sex">
            {SEX_FILTER_OPTIONS.map((option) => {
              const isChecked = selectedSexFilters.includes(option.value);

              return (
                <label
                  key={option.value}
                  className="console-filter-check"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSexFilter(option.value)}
                  />
                  <i className={`bi ${option.icon}`} aria-hidden="true"></i>
                  <span>{option.value}</span>
                </label>
              );
            })}
          </div>

          <div className="console-country-filter">
            <label htmlFor="console-country-filter" className="visually-hidden">
              Country
            </label>
            <select
              id="console-country-filter"
              className="form-select console-country-select"
              value={selectedCountryFilter}
              aria-label={`Country: ${selectedCountryOption?.label || WORLD_COUNTRY_FILTER}`}
              onChange={(event) => setSelectedCountryFilter(event.target.value)}
            >
              {countryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.flag} {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="console-age-filter">
            <label className="visually-hidden" htmlFor="console-age-group-filter">
              Age group
            </label>
            <select
              id="console-age-group-filter"
              className="form-select console-age-select"
              value={selectedAgeGroup}
              aria-label="Age group"
              onChange={(event) => handleAgeGroupChange(event.target.value)}
            >
              {AGE_GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </aside>
      </div>

      {/* Search Button */}
      <div className={`mt-4${showSearchInfo ? "" : " mb-4"}`}>
        <button className="btn btn-primary w-100" onClick={runSearch} disabled={isSearchDisabled}>
          Search
        </button>
      </div>

      {/* Info Text */}
      {showSearchInfo && (
        <div className="console-search-info mt-3 d-flex justify-content-between gap-3">
          {searchSetupMessage ? (
            <p className="text-muted mb-0">
              {searchSetupMessage}
            </p>
          ) : !hasUnlimitedSearches && (
            <p className="console-free-searches-message text-muted mb-0">
              {freeSearchesRemaining <= 0
                ? freeSearchesResetAt
                  ? (() => {
                      const resetDate = new Date(freeSearchesResetAt);
                      const timeStr = formatResetTime(freeSearchesResetAt);
                      const today = new Date();
                      const tomorrow = new Date(today);
                      tomorrow.setDate(today.getDate() + 1);
                      const isToday = resetDate.toDateString() === today.toDateString();
                      const isTomorrow = resetDate.toDateString() === tomorrow.toDateString();
                      const dayLabel = isToday ? "today" : isTomorrow ? "tomorrow" : resetDate.toLocaleDateString(undefined, { weekday: "long" });
                      return (
                        <>
                          {`*Your 3 free searches will reset ${dayLabel} at ${timeStr}. `}
                          <a
                            href="#"
                            className="console-get-more-link"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openPricingDropdown();
                            }}
                          >
                            Get More Now
                          </a>
                        </>
                      );
                    })()
                  : "*Your 3 free searches have been used up."
                : `*You have ${freeSearchesRemaining} free ${freeSearchesRemaining === 1 ? "search" : "searches"} remaining`
              }
            </p>
          )}
          {userCount >= 10000 && (
            <p className="text-muted mb-0 ms-auto">
              {userCount.toLocaleString()} users
            </p>
          )}
        </div>
      )}

      {/* Search Error */}
      {!isSearching && searchError && (
        <div className="container px-0">
          <div className="card nothing-card text-center mt-4 mb-4">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-danger m-0">Search failed: {searchError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Too many keywords selected */}
      {!isSearching && hasTooManyKeywords && !searchError && (
        <div className="container px-0">
          <div className="card nothing-card text-center mt-4 mb-4">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-muted m-0">Select up to {MAX_SEARCH_KEYWORDS} keywords to search.</p>
            </div>
          </div>
        </div>
      )}

      {/* Not searched yet */}
      {!isSearching && !hasTooManyKeywords && !needsKeyword && searchResults === null && (
        <div className="container px-0">
          <div className="card nothing-card text-center mt-4 mb-4">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-muted m-0">You didn't search yet.</p>
            </div>
          </div>
        </div>
      )}

      {/* Searching Spinner */}
      {isSearching && (
        <div className="card nothing-card text-center mt-4 mb-4">
          <div className="card-body d-flex justify-content-center align-items-center">
            <div className="spinner-border spinner-primary" role="status">
              <span className="visually-hidden">Searching...</span>
            </div>
          </div>
        </div>
      )}

      {/* No keyword selected */}
      {!isSearching && needsKeyword && (
        <div className="container px-0">
          <div className="card nothing-card text-center mt-4 mb-4">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-muted m-0">Select at least one keyword to search.</p>
            </div>
          </div>
        </div>
      )}

      {/* No matches */}
      {!isSearching && !needsKeyword && searchResults !== null && searchResults.length === 0 && (
        <div className="container px-0">
          <div className="card nothing-card text-center mt-4 mb-4">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-muted m-0">No users found matching your selected interests.</p>
            </div>
          </div>
        </div>
      )}

      {/* People List */}
      {!isSearching && !needsKeyword && searchResults !== null && searchResults.length > 0 && (
        <div className="container px-0 mt-4" ref={peopleContainerRef}>
          <h2>Showing {searchResults.length} {searchResults.length === 1 ? "person" : "people"}:</h2>
          <div style={{ overflowX: "auto", overflowY: "hidden", scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }} className="mt-4 mb-4">
            <div style={{ display: "flex", flexWrap: "nowrap", gap: "1rem", width: "max-content" }}>
              {searchResults.map((person, index) => (
                <div key={person.id ?? index} style={{ flex: "0 0 auto", width: "320px" }}>
                  <div className="card">
                    <div className="card-body">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <img
                          src={person.profilePicture || defaultProfile}
                          alt={person.name}
                          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", objectPosition: "center", border: "2px solid #dee2e6", flexShrink: 0 }}
                        />
                        <h4 className="card-title mb-0">
                          {person.name}{person.isCurrentUser ? " (Me)" : ""}
                        </h4>
                      </div>
                      <div className="card-text">
                        {(person.age != null || person.birthday) && (
                          <p className="mb-1"><i className="bi bi-cake2 me-2"></i>{person.age ?? getAge(person.birthday)} years old</p>
                        )}
                        <p className="mb-1"><i className="bi bi-geo-alt me-2"></i>{person.location}</p>
                        {person.contacts.phone?.show && person.contacts.phone?.value && (
                          <p className="mb-1"><a href={`tel:${person.contacts.phone.value.replace(/\s+/g, "")}`} style={{ textDecoration: "underline", color: "inherit" }}><i className="bi bi-telephone me-2"></i>{person.contacts.phone.value}</a></p>
                        )}
                        {person.contacts.instagram?.show && person.contacts.instagram?.value && (
                          <p className="mb-1"><a href={`https://instagram.com/${person.contacts.instagram.value}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", color: "inherit" }}><i className="bi bi-instagram me-2"></i>@{person.contacts.instagram.value}</a></p>
                        )}
                        {person.contacts.tiktok?.show && person.contacts.tiktok?.value && (
                          <p className="mb-1"><a href={`https://tiktok.com/@${person.contacts.tiktok.value}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", color: "inherit" }}><i className="bi bi-tiktok me-2"></i>@{person.contacts.tiktok.value}</a></p>
                        )}
                        {person.contacts.snapchat?.show && person.contacts.snapchat?.value && (
                          <p className="mb-1"><a href={`https://snapchat.com/add/${person.contacts.snapchat.value}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", color: "inherit" }}><i className="bi bi-snapchat me-2"></i>@{person.contacts.snapchat.value}</a></p>
                        )}
                        {person.contacts.discord?.show && person.contacts.discord?.value && (
                          <p className="mb-1"><i className="bi bi-discord me-2"></i>@{person.contacts.discord.value}</p>
                        )}
                      </div>
                      <div className="d-flex flex-wrap gap-2 mt-2" style={{ maxHeight: "165px", overflowY: "auto" }}>
                        {[
                          ...(person.keywordIds || []).filter(id => searchedKeywords.includes(id)),
                          ...(person.keywordIds || []).filter(id => !searchedKeywords.includes(id)),
                        ].map((id) => {
                          const kw = keywordMap[id];
                          if (!kw) return null;
                          const isMatch = searchedKeywords.includes(id);
                          return (
                            <button key={id} type="button" className={`btn ${isMatch ? "btn-category" : "btn-category-outline"} modal-keyword-card`}>
                              <small className="d-block text-start opacity-75">{kw.subcategory}</small>
                              <div className="d-flex align-items-center gap-2">
                                <span>{kw.name}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
