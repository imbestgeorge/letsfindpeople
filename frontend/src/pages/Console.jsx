import { useState, useMemo, useEffect, useDeferredValue, useRef } from "react";
import defaultProfile from "../assets/default-profile.jpg";
import { useDbData } from "../context/DbDataContext";
import { useAuth } from "../context/AuthContext";
import { searchUsers, consumeSearchAllowance, requestKeyword, getUserCount } from "../lib/catalogService";

const MAX_SEARCH_KEYWORDS = 12;
const GENDER_KEYWORDS = ["Male", "Female", "Other"];
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

const getAge = (birthday) => {
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

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

export default function Console({ currentUser }) {
  const { dbData, isLoading: catalogLoading } = useDbData();
  const { session } = useAuth();

  // State Management
  const [selectedKeywords, setSelectedKeywords] = useState([]);
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
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 576px)").matches : false
  );
  const [freeSearchesRemaining, setFreeSearchesRemaining] = useState(
    currentUser?.freeSearchesRemaining ?? 3
  );

  const isAdmin = currentUser?.idType === 2;
  const hasUnlimitedSearches =
    isAdmin ||
    currentUser?.subscriptionStatus === "active" ||
    currentUser?.subscriptionStatus === "canceling";
  const hasFreeSearchesRemaining = freeSearchesRemaining > 0;
  const isLoggedIn = !!session?.user;
  const countryItems = useMemo(
    () => dbData?.categories?.[7]?.subcategories?.[0]?.items ?? [],
    [dbData]
  );
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

  useEffect(() => {
    setFreeSearchesRemaining(currentUser?.freeSearchesRemaining ?? 3);
  }, [currentUser?.freeSearchesRemaining]);

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

  // Convert savedProfile from Navbar into a user object compatible with the list
  const currentUserFormatted = useMemo(() => {
    if (!currentUser?.firstName) return null;
    const { birthDay, birthMonth, birthYear } = currentUser;
    const birth = new Date(Number(birthYear), Number(birthMonth) - 1, Number(birthDay));
    const age = Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    // Navbar stores names in `selected`; resolve them to IDs
    const keywordIds = Object.values(currentUser.selected || {})
      .flat()
      .map((name) => nameToIdMap[name])
      .filter((id) => id != null);
    return {
      id: "current",
      name: `${currentUser.firstName} ${currentUser.lastName}`,
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

  // Run search: call backend with selected keyword IDs, then prepend current user if matching
  const runSearch = async () => {
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

        if (!allowance.allowed) {
          setSearchError(allowance.reason || "You have no free searches remaining.");
          setSearchResults([]);
          return;
        }
      }

      const { users } = await searchUsers(selectedKeywords);
      // Filter out the current user from backend results to avoid duplicate
      const filtered = session?.user?.id
        ? users.filter(u => u.supabaseUid !== session.user.id)
        : users;
      // Prepend current user if they match all selected keywords
      const results = [...filtered];
      if (
        currentUserFormatted &&
        selectedKeywords.every((id) => (currentUserFormatted.keywordIds || []).includes(id))
      ) {
        results.unshift(currentUserFormatted);
      }
      setSearchResults(results);
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
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [dbData]);

  // Filter keywords based on debounced search term
  const filteredKeywords = useMemo(() => {
    if (!debouncedSearchTerm.trim()) return allKeywords;
    return allKeywords.filter((item) =>
      item.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );
  }, [debouncedSearchTerm, allKeywords]);

  const deferredFilteredKeywords = useDeferredValue(filteredKeywords);

  // Keyword Selection
  const toggleKeyword = (id) => {
    setSelectedKeywords((prev) =>
      prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]
    );
  };

  // Clear isResetting only once deferredFilteredKeywords has caught up to allKeywords
  useEffect(() => {
    if (isResetting && deferredFilteredKeywords === allKeywords) {
      setIsResetting(false);
    }
  }, [isResetting, deferredFilteredKeywords, allKeywords]);

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
          {deferredFilteredKeywords.length > 100 ? (
            <>
              Showing 100 out of {deferredFilteredKeywords.length.toLocaleString()} keywords.
              <span className="console-results-hint"> Use the search bar to find more.</span>
            </>
          ) : (
            `Showing ${deferredFilteredKeywords.length.toLocaleString()} results`
          )}
        </small>
      </div>

      {/* Keywords Container */}
      <div className="border rounded-4 p-3 unselected-keywords-container">
        <div className="modal-scroll-area d-flex flex-wrap gap-2">
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
                const visibleUnselected = unselected.slice(0, Math.max(0, 100 - selected.length));
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
                    {visibleUnselected.map((item) => (
                      <button
                        key={item.id}
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
            <p className="text-muted mb-0">
              *You have {freeSearchesRemaining} free {freeSearchesRemaining === 1 ? "search" : "searches"} remaining
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
          <div className="card nothing-card text-center mt-4 mb-5">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-danger m-0">Search failed: {searchError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Too many keywords selected */}
      {!isSearching && hasTooManyKeywords && !searchError && (
        <div className="container px-0">
          <div className="card nothing-card text-center mt-4 mb-5">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-muted m-0">Select up to {MAX_SEARCH_KEYWORDS} keywords to search.</p>
            </div>
          </div>
        </div>
      )}

      {/* Not searched yet */}
      {!isSearching && !hasTooManyKeywords && !needsKeyword && searchResults === null && (
        <div className="container px-0">
          <div className="card nothing-card text-center mt-4 mb-5">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-muted m-0">You didn't search yet.</p>
            </div>
          </div>
        </div>
      )}

      {/* Searching Spinner */}
      {isSearching && (
        <div className="card nothing-card text-center mt-4 mb-5">
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
          <div className="card nothing-card text-center mt-4 mb-5">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-muted m-0">Select at least one keyword to search.</p>
            </div>
          </div>
        </div>
      )}

      {/* No matches */}
      {!isSearching && !needsKeyword && searchResults !== null && searchResults.length === 0 && (
        <div className="container px-0">
          <div className="card nothing-card text-center mt-4 mb-5">
            <div className="card-body d-flex justify-content-center align-items-center">
              <p className="card-text text-muted m-0">No users found matching your selected interests.</p>
            </div>
          </div>
        </div>
      )}

      {/* People List */}
      {!isSearching && !needsKeyword && searchResults !== null && searchResults.length > 0 && (
        <div className="container px-0 mt-4">
          <h2>Showing {searchResults.length} {searchResults.length === 1 ? "person" : "people"}:</h2>
          <div style={{ overflowX: "auto", overflowY: "hidden", scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }} className="mt-4 mb-5">
            <div style={{ display: "flex", flexWrap: "nowrap", gap: "1rem", width: "max-content" }}>
              {searchResults.map((person, index) => (
                <div key={person.id ?? index} style={{ flex: "0 0 auto", width: "320px" }}>
                  <div className="card">
                    <div className="card-body">
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <img
                          src={person.profilePicture || defaultProfile}
                          alt={person.name}
                          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid #dee2e6", flexShrink: 0 }}
                        />
                        <h4 className="card-title mb-0">
                          {person.name}
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
                      <div className="d-flex flex-wrap gap-2 mt-2" style={{ maxHeight: "90px", overflowY: "auto" }}>
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
