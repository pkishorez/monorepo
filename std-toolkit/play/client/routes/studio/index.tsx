import { useCallback } from "react";
import { useDescriptors } from "./hooks";
import { useStudioStore } from "./store";
import { EntityCard } from "./components";

export function StudioRoute() {
  const { isLoading } = useDescriptors();
  const descriptors = useStudioStore((s) => s.descriptors);

  const handleEntityClick = useCallback((entityName: string) => {
    const element = document.getElementById(`entity-${entityName}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold mb-1">Studio</h1>
        <p className="text-neutral-400 text-sm">Entity schema explorer</p>
      </div>

      {isLoading ? (
        <div className="text-neutral-500 text-center">Loading...</div>
      ) : (
        <div className="flex flex-wrap justify-center gap-4">
          {descriptors.map((descriptor) => (
            <EntityCard
              key={descriptor.name}
              descriptor={descriptor}
              onEntityClick={handleEntityClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
