import { getRouteApi, useNavigate } from '@tanstack/react-router';
import type { DevtoolsTool } from './store';

export const routeApi = getRouteApi('/devtools/');

/**
 * The active DevTools tool, sourced from the `?tool=` URL search param so the
 * selection is shareable and survives reloads via the address bar (not storage).
 */
export function useActiveTool(): [DevtoolsTool, (tool: DevtoolsTool) => void] {
  const tool = routeApi.useSearch({ select: (s) => s.tool });
  const navigate = useNavigate();
  const setTool = (next: DevtoolsTool) =>
    void navigate({
      to: '/devtools',
      search: (prev) => ({ ...prev, tool: next }),
      replace: true,
    });
  return [tool, setTool];
}
