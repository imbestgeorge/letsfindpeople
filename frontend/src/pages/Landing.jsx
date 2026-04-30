import login from "../assets/login.gif";
import profile from "../assets/profile.gif";
import search from "../assets/search.gif";

import profiles from "../assets/profiles.png";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LAUNCH_MESSAGE, useLaunchLive } from "../lib/launch";

function Landing() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const launchLive = useLaunchLive();

  const handleSearchNow = () => {
    if (session) {
      navigate("/console");
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    navigate("/?auth=open");
  };

  return (
    <div class="container mt-4">
        <h1 className="landing-title">The best website to find people with same interests!</h1>
        
        <div className="mt-5 mb-3 mb-md-0 landing-steps">
          <div className="row row-cols-1 row-cols-md-3 g-4 landing-steps-row">
            <div className="col">
              <div className="card h-100">
                <img src={login} className="card-img-top"/>
                <div className="card-body text-center">
                  <h3>1- Login</h3>
                  <p>Create your account and login</p>
                </div>
              </div>
            </div>
            <div className="col">
              <div class="card h-100">
                <img src={profile} className="card-img-top"/>
                <div class="card-body text-center">
                  <h3>2- Set Up Profile</h3>
                  <p>Fill in the details in your profile</p>
                </div>
              </div>
            </div>
            <div className="col">
              <div class="card h-100">
                <img src={search} className="card-img-top"/>
                <div class="card-body text-center">
                  <h3>3- Search</h3>
                  <p>Find people with same interests</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="row">
            {launchLive ? (
              <div className="col-12 col-md-4 mx-auto">
                <>
                  <button type="button" className="btn btn-sm main-btn w-100" onClick={handleSearchNow}>
                    Search Now!
                  </button>
                  <div className="d-flex align-items-center justify-content-center gap-2">
                    <img src={profiles} style={{ height: '32px' }} alt="" />
                    <strong>350k Users Available</strong>
                  </div>
                </>
              </div>
            ) : (
              <div className="col-12 col-md-10 mx-auto">
                <div className="text-center">
                  <h2 className="landing-launch-message text-muted">{LAUNCH_MESSAGE}</h2>
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

export default Landing;
