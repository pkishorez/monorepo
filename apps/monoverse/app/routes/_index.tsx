import { type MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "monoverse" },
    { name: "description", content: "Welcome to monoverse!" },
  ];
};

export default function Index() {
  return (
    <div className="m-5">
      <h1>Welcome to monoverse!</h1>
      <Link to="/dashboard">dashboard</Link>
    </div>
  );
}
