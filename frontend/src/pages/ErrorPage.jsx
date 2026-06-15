import { Link } from "react-router-dom";

const errorContent = {
  notFound: {
    code: "404",
    title: "Page not found",
    message: "The page you are looking for does not exist or may have been moved.",
    showHome: true,
  },
  unauthorized: {
    code: "401",
    title: "Sign in required",
    message: "You need to be signed in before opening this page.",
    showHome: true,
  },
  forbidden: {
    code: "403",
    title: "Access not allowed",
    message: "Your account does not have permission to open this page.",
    showHome: true,
  },
  accountDeleted: {
    code: "410",
    title: "Account permanently deleted",
    message: "This account was permanently deleted and can no longer be used to sign in.",
    showHome: false,
  },
  underageBanned: {
    code: "403",
    title: "Account banned — age restriction",
    message:
      "Your account has been permanently banned because you are under 16 years old. " +
      "LetsFindPeople requires all users to be at least 16. " +
      "Your personal information has been removed. " +
      "If you believe this is an error, please contact us at contact@letsfindpeople.com.",
    showHome: false,
  },
};

export default function ErrorPage({ type = "notFound" }) {
  const error = errorContent[type] || errorContent.notFound;

  return (
    <div className="error-page container">
      <div className="error-page__code">{error.code}</div>
      <h1 className="error-page__title">{error.title}</h1>
      <p className="error-page__message">{error.message}</p>
      {error.showHome && (
        <Link className="btn btn-primary error-page__button" to="/">
          Go Home
        </Link>
      )}
    </div>
  );
}
