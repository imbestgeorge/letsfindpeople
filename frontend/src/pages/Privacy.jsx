export default function Privacy() {
  return (
    <div className="policy-page container py-5">
      <h1 className="policy-title">Privacy Policy</h1>
      <div className="policy-content">
        <p>
          <strong>Last updated: 22 June 2026</strong>
        </p>

        <p>
          LetsFindPeople (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the
          website and all related services (the &quot;Service&quot;). This
          Privacy Policy explains how we collect, use, store, and protect your
          personal information when you use our Service.
        </p>

        <h4>1. Information We Collect</h4>
        <p>
          When you create or edit a profile, we may collect the following
          personal information:
        </p>
        <ul>
          <li>
            <strong>Authentication data:</strong> we use Google authentication
            to sign users in and create their account securely.
          </li>
          <li>
            <strong>Basic profile information:</strong> name and email address.
          </li>
          <li>
            <strong>Identity data:</strong> first name, last name, date of
            birth, profile picture.
          </li>
          <li>
            <strong>Contact data:</strong> email address, phone number, and
            usernames for Instagram, TikTok, Snapchat, and Discord -- only the
            ones you choose to add.
          </li>
          <li>
            <strong>Location data:</strong> city and country you provide or
            detect via your browser&apos;s geolocation API. Browser location is
            requested only when you choose the automatic location option and
            grant your browser&apos;s location permission.
          </li>
          <li>
            <strong>Interest data:</strong> keywords, answers to interest
            questions, hobbies, personality, sexuality, and other profile
            selections you make.
          </li>
          <li>
            <strong>Technical data:</strong> IP address, browser type, device
            information, and usage logs automatically collected when you use the
            Service.
          </li>
          <li>
            <strong>Communications and permission data:</strong> global chat
            messages you send, notification read or dismissal status,
            draw-event invite activity, keyword requests you submit, and the
            profile visibility permissions you choose.
          </li>
          <li>
            <strong>Payment and subscription data:</strong> subscription status,
            Stripe customer and subscription identifiers, and billing events
            needed to manage paid plans. We do not store your full payment card
            details.
          </li>
        </ul>

        <h4>2. How We Use Your Information</h4>
        <ul>
          <li>To create and manage your account and profile.</li>
          <li>
            To display your profile to other users when they perform keyword
            searches.
          </li>
          <li>To process subscription payments and manage your plan.</li>
          <li>
            To provide global chat, in-app notifications, draw-event invites,
            keyword requests, and other account features.
          </li>
          <li>
            To detect and prevent abuse, scraping, unauthorised access, and
            spam.
          </li>
          <li>To improve and maintain the Service.</li>
          <li>To comply with legal obligations.</li>
        </ul>

        <h4>3. Data Encryption and Security</h4>
        <p>
          We take data security seriously. Profile data -- including your
          interests and keyword selections -- will be encrypted at rest, ensuring
          that even in the event of a data breach, individual interest data
          cannot be attributed to a specific user by an attacker. We implement
          industry-standard security measures including encrypted transmission
          (HTTPS) and access controls. However, no system is completely
          impenetrable, and we cannot guarantee absolute security.
        </p>

        <h4>4. Data Visibility and Permissions</h4>
        <p>
          Your public profile may show your name, profile picture, location, and
          selected interests when another user finds you through the Service.
          Contact information (phone number, Instagram, TikTok, Snapchat, and
          Discord usernames) is only shown to other users if you explicitly
          enable the visibility permission for each field. Your email address is
          never shown publicly.
        </p>
        <p>
          You can change these profile visibility permissions at any time from
          your profile settings. If you deny browser location permission, you can
          still enter your location manually.
        </p>
        <p>
          Messages sent in the international chat are visible to signed-in users
          and may show your name and profile picture. Site notifications and
          draw-event invites may record whether you have received, opened,
          dismissed, or completed the related signup flow.
        </p>

        <h4>5. Data Sharing</h4>
        <p>
          We do not sell your personal information or share it for advertising
          or marketing purposes. We may share your data only when needed to
          operate the Service or when required by law, including with:
        </p>
        <ul>
          <li>
            Third-party service providers who assist us in operating the Service
            (e.g. Google authentication, Supabase hosting, database and storage,
            and Stripe payment processing), bound by appropriate confidentiality
            or data-processing terms.
          </li>
          <li>
            Law enforcement or regulatory authorities if required by applicable
            law.
          </li>
        </ul>

        <h4>6. Data Retention</h4>
        <p>
          We retain your personal data for as long as your account is active or
          as needed to provide the Service. You may request deletion of your
          account and data at any time by contacting us. Global chat messages
          are designed to be short-lived and are retained for up to 7 days.
          Certain security logs, billing records, moderation records, and
          account deletion records may be retained where needed for legal,
          accounting, security, or abuse-prevention purposes.
        </p>

        <h4>7. Your Rights (GDPR)</h4>
        <p>
          If you are located in the European Economic Area or the UK, you have
          the right to:
        </p>
        <ul>
          <li>Access the personal data we hold about you.</li>
          <li>Request correction or deletion of your data.</li>
          <li>Object to or restrict processing of your data.</li>
          <li>Request portability of your data.</li>
          <li>Withdraw consent at any time.</li>
          <li>Lodge a complaint with your local data protection authority.</li>
        </ul>
        <p>
          To exercise any of these rights, please contact us at{" "}
          <a href="mailto:contact@letsfindpeople.com">
            contact@letsfindpeople.com
          </a>
          .
        </p>

        <h4>8. Children</h4>
        <p>
          The Service is not directed at children under 16. We do not knowingly
          collect personal information from children. If you believe a child has
          provided us with personal data, please contact us and we will delete it
          promptly.
        </p>

        <h4>9. Changes to This Policy</h4>
        <p>
          We may update this Privacy Policy from time to time. We will notify
          users of significant changes by updating the date at the top of this
          page.
        </p>

        <h4>10. Contact</h4>
        <p>
          For any privacy-related questions, contact us at:{" "}
          <a href="mailto:contact@letsfindpeople.com">
            contact@letsfindpeople.com
          </a>
        </p>
      </div>
    </div>
  );
}
