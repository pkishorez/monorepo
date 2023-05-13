import type { V2_MetaFunction } from "@remix-run/node";
import { Landing } from "@pkg/components";

export const meta: V2_MetaFunction = () => {
  return [{ title: "New Remix App" }];
};

export default function Index() {
  return (
    <Landing>
      <div className="text-lg mt-3">This is a Remix App 🚀</div>
    </Landing>
  );
}
