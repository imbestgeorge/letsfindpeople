import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import defaultProfile from "../assets/default-profile.jpg";

function getAge(birthday) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function contactRows(contacts = {}) {
  return [
    contacts.instagram?.show && contacts.instagram?.value
      ? {
          key: "instagram",
          icon: "bi-instagram",
          label: `@${contacts.instagram.value}`,
          href: `https://instagram.com/${contacts.instagram.value}`,
        }
      : null,
    contacts.tiktok?.show && contacts.tiktok?.value
      ? {
          key: "tiktok",
          icon: "bi-tiktok",
          label: `@${contacts.tiktok.value}`,
          href: `https://tiktok.com/@${contacts.tiktok.value}`,
        }
      : null,
    contacts.snapchat?.show && contacts.snapchat?.value
      ? {
          key: "snapchat",
          icon: "bi-snapchat",
          label: `@${contacts.snapchat.value}`,
          href: `https://snapchat.com/add/${contacts.snapchat.value}`,
        }
      : null,
    contacts.discord?.show && contacts.discord?.value
      ? {
          key: "discord",
          icon: "bi-discord",
          label: `@${contacts.discord.value}`,
          href: null,
        }
      : null,
  ].filter(Boolean);
}

export default function ProfilePreviewModal({
  profile,
  keywordMap = {},
  searchedKeywords = [],
  onClose,
  onSendMessage,
  showSendMessage = false,
  isCurrentUser = false,
}) {
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const profileUrl = profile?.username
    ? `${window.location.origin}/${profile.username}`
    : window.location.origin;
  const rows = useMemo(() => contactRows(profile?.contacts), [profile?.contacts]);
  const galleryUrls = Array.isArray(profile?.profileGalleryUrls)
    ? profile.profileGalleryUrls.slice(0, 3)
    : [];
  const orderedKeywordIds = useMemo(() => {
    const ids = Array.isArray(profile?.keywordIds) ? profile.keywordIds : [];
    const searched = new Set(searchedKeywords || []);
    return [
      ...ids.filter((id) => searched.has(id)),
      ...ids.filter((id) => !searched.has(id)),
    ];
  }, [profile, searchedKeywords]);

  useEffect(() => {
    if (!showQr || !profileUrl) return;

    let cancelled = false;
    QRCode.toDataURL(profileUrl, {
      margin: 2,
      width: 220,
      color: {
        dark: "#6D28D9",
        light: "#F5F3FF",
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [profileUrl, showQr]);

  if (!profile) return null;

  const name = profile.name || `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Profile";
  const age = profile.age ?? getAge(profile.birthday);
  const theme = profile.profileTheme || "violet";

  const shareProfile = async () => {
    setShareNotice("");
    const text = "Find me on LetsFindPeople.";

    if (navigator.share) {
      try {
        await navigator.share({
          title: "LetsFindPeople",
          text,
          url: profileUrl,
        });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${text} ${profileUrl}`);
      setShareNotice("Profile link copied.");
    } catch {
      setShareNotice("Sharing is not available in this browser.");
    }
  };

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="profilePreviewTitle">
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="profilePreviewTitle">Profile</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className={`profile-preview-card profile-preview-card--${theme}`}>
                <div className="profile-preview-topline">
                  <div className="profile-preview-avatar-wrap">
                    <img
                      src={profile.profilePicture || profile.profileImagePreview || defaultProfile}
                      alt={name}
                      className="profile-preview-avatar"
                    />
                    <span
                      className={`profile-presence-dot ${profile.isOnline ? "profile-presence-dot--online" : "profile-presence-dot--offline"}`}
                      title={profile.isOnline ? "Online" : "Offline"}
                      aria-label={profile.isOnline ? "Online" : "Offline"}
                    ></span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="card-title mb-1 profile-preview-name">
                      {name}{isCurrentUser ? " (Me)" : ""}
                    </h4>
                    {profile.username && (
                      <div className="profile-preview-username">@{profile.username}</div>
                    )}
                  </div>
                  <div className="profile-preview-actions ms-auto">
                    <button
                      type="button"
                      className="profile-icon-button"
                      onClick={shareProfile}
                      title="Share profile"
                      aria-label="Share profile"
                    >
                      <i className="bi bi-share"></i>
                    </button>
                    <button
                      type="button"
                      className="profile-icon-button"
                      onClick={() => setShowQr((current) => !current)}
                      title="Show QR code"
                      aria-label="Show QR code"
                    >
                      <i className="bi bi-qr-code"></i>
                    </button>
                  </div>
                </div>

                {shareNotice && (
                  <small className="text-muted d-block mt-2" aria-live="polite">{shareNotice}</small>
                )}

                {showQr && (
                  <div className="profile-qr-panel">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Profile QR code" className="profile-qr-image" />
                    ) : (
                      <div className="spinner-border spinner-border-sm text-primary" role="status">
                        <span className="visually-hidden">Loading QR code...</span>
                      </div>
                    )}
                    <div className="profile-qr-caption">Find me on LetsFindPeople.</div>
                  </div>
                )}

                <div className="card-text profile-preview-details">
                  {age != null && (
                    <p className="mb-1"><i className="bi bi-cake2 me-2"></i>{age} years old</p>
                  )}
                  {profile.location && (
                    <p className="mb-1"><i className="bi bi-geo-alt me-2"></i>{profile.location}</p>
                  )}
                  {rows.map((contact) => (
                    <p className="mb-1" key={contact.key}>
                      <i className={`bi ${contact.icon} me-2`}></i>
                      {contact.href ? (
                        <a href={contact.href} target="_blank" rel="noopener noreferrer" className="profile-contact-link">
                          {contact.label}
                        </a>
                      ) : (
                        contact.label
                      )}
                    </p>
                  ))}
                </div>

                {galleryUrls.length > 0 && (
                  <div className="profile-gallery-strip">
                    {galleryUrls.map((url, index) => (
                      <img key={`${url}-${index}`} src={url} alt="" className="profile-gallery-image" />
                    ))}
                  </div>
                )}

                {orderedKeywordIds.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mt-3 profile-preview-keywords">
                    {orderedKeywordIds.map((id) => {
                      const kw = keywordMap[id];
                      if (!kw) return null;
                      const isMatch = searchedKeywords.includes(id);
                      return (
                        <span key={id} className={`btn ${isMatch ? "btn-category" : "btn-category-outline"} modal-keyword-card`}>
                          <small className="d-block text-start opacity-75">{kw.subcategory}</small>
                          <span>{kw.name}</span>
                        </span>
                      );
                    })}
                  </div>
                )}

                {showSendMessage && !isCurrentUser && (
                  <button
                    type="button"
                    className="btn btn-primary w-100 mt-3"
                    onClick={() => onSendMessage?.(profile)}
                  >
                    <i className="bi bi-send me-1"></i>
                    Send Message
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}
