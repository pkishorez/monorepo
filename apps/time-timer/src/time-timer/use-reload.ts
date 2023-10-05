import { useCallback, useState } from "react";

export const useReload = () => {
  const [reload, setReload] = useState(false);

  return useCallback(() => {
    setReload(!reload);
  }, [reload]);
};
