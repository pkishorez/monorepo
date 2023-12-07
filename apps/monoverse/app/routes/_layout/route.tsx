import { Outlet } from "@remix-run/react";

export default function Layout() {
  return (
    <div className="m-5 mx-auto max-w-7xl">
      layout
      <Outlet />
    </div>
  );
}
