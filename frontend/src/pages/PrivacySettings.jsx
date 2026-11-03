import { useEffect, useState } from "react";
import { LoaderCircle, LockKeyhole, Save } from "lucide-react";
import api, { getApiError } from "../services/api";
import "./ProfilePages.css";

const choices = [
  ["EVERYONE", "Everyone"],
  ["FOLLOWERS_ONLY", "Followers only"],
  ["ONLY_ME", "Only me"],
];

export default function PrivacySettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let active = true;
    api.get("/api/users/profile/privacy")
      .then((response) => {
        if (active && response.data?.settings) setSettings(response.data.settings);
        else if (active) setError("The server returned invalid privacy settings.");
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadCount]);

  function updateSetting(event) {
    setSettings((current) => ({ ...current, [event.target.name]: event.target.value }));
    setNotice("");
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.put("/api/users/profile/privacy", settings);
      setSettings(response.data.settings);
      setNotice("Your privacy settings have been saved.");
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="privacy-settings-page">
      <header className="privacy-settings-heading">
        <span><LockKeyhole size={21} /></span>
        <div><p className="creator-profile-eyebrow">ACCOUNT SETTINGS</p><h1>Privacy</h1><p>Choose who can see your followers and following lists.</p></div>
      </header>
      {error && <p className="creator-profile-error" role="alert">{error}</p>}
      {notice && <p className="privacy-settings-notice" role="status">{notice}</p>}
      {loading ? <p className="creator-profile-state" role="status">Loading privacy settings…</p> : !settings ? (
        <div className="creator-profile-state">
          <p>Privacy settings are unavailable. Your current choices have not been changed.</p>
          <button type="button" onClick={() => { setError(""); setLoading(true); setReloadCount((count) => count + 1); }}>Try again</button>
        </div>
      ) : (
        <form className="privacy-settings-form" onSubmit={saveSettings}>
          <label>
            <span><strong>Followers list</strong><small>Who can see the people who follow you?</small></span>
            <select name="followersVisibility" value={settings.followersVisibility} onChange={updateSetting}>
              {choices.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span><strong>Following list</strong><small>Who can see the people you follow?</small></span>
            <select name="followingVisibility" value={settings.followingVisibility} onChange={updateSetting}>
              {choices.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <p className="privacy-settings-help">List visibility does not hide the follower or following counts on your public profile.</p>
          <button type="submit" disabled={saving}>{saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "Saving…" : "Save privacy settings"}</button>
        </form>
      )}
    </section>
  );
}
