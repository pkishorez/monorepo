import { json, type LoaderFunction, type MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getMonorepo } from "~/logic/implementation";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export const loader: LoaderFunction = () => {
  const cwd = process.cwd();

  return json({
    monorepo: getMonorepo(cwd),
  });
};

export default function Index() {
  const data = useLoaderData();
  return (
    <div className="m-5">
      <p className="p-4 whitespace-pre font-mono bg-gray-200">
        {JSON.stringify(data, null, "  ")}
      </p>
    </div>
  );
}
