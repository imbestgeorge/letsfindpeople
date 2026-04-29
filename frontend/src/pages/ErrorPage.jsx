import { Link } from "react-router-dom";

const errorContent = {
  notFound: {
    code: "404",
    title: "Page not found",
    message: "The page you are looking for does not exist or may have been moved.",
  },
  unauthorized: {
    code: "401",
    title: "Sign in required",
    message: "You need to be signed in before opening this page.",
  },
  forbidden: {
    code: "403",
    title: "Access not allowed",
    message: "Your account does not have permission to open this page.",
  },
};

export default function ErrorPage({ type = "notFound" }) {
  const error = errorContent[type] || errorContent.notFound;

  return (
    <div className="error-page container">
      <div className="error-page__code">{error.code}</div>
      <h1 className="error-page__title">{error.title}</h1>
      <p className="error-page__message">{error.message}</p>
      <Link className="btn btn-primary error-page__button" to="/">
        Go Home
      </Link>
    </div>
  );
}
